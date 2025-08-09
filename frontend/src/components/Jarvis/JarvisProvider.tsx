"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { connectJarvisWebSocket } from "@/api/jarvisApi";

// =============== Types ===============
type JarvisState = "idle" | "listening" | "speaking";

interface ChatMsg {
  role: "user" | "assistant" | "system";
  text: string;
}

interface JarvisContextProps {
  enabled: boolean;
  state: JarvisState;
  setEnabled: (v: boolean) => void;
  setState: (s: JarvisState) => void;
  messages: ChatMsg[];
  streamBuf: string;
}

const JarvisContext = createContext<JarvisContextProps | undefined>(undefined);

// =============== Helpers (frontend) ===============
function encodeBase64(bytes: Uint8Array): string {
  // Avoid spread; chunk to prevent stack overflow & corruption
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize) as unknown as number[]);
  }
  return btoa(binary);
}

function getMonoMixdown(input: Float32Array[]): Float32Array {
  if (!input || input.length === 0) return new Float32Array(0);
  if (input.length === 1) return input[0];
  // Mix L/R → mono with -3 dB compensation
  const len = input[0].length;
  const out = new Float32Array(len);
  const gain = 0.70710678; // why: prevent clipping when summing channels
  for (let i = 0; i < len; i++) {
    let s = 0;
    for (let ch = 0; ch < input.length; ch++) s += input[ch][i];
    out[i] = s * gain / input.length;
  }
  return out;
}

export function JarvisProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<JarvisState>("idle");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [streamBuf, setStreamBuf] = useState("");

  const audioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  // TTS queue
  const ttsQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);

  function getAudioContext() {
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
      console.log("🔓 AudioContext created @", ctx.sampleRate, "Hz");
    }
    return ctx;
  }

  function createAndUnlockAudioElement() {
    if (!audioElementRef.current) {
      const el = new Audio();
      el.src = "data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAA";
      el.play().catch(() => {});
      audioElementRef.current = el;
    }
  }

  function clearTTSQueueAndStop() {
    ttsQueueRef.current = [];
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
      } catch {}
      audioElementRef.current.src = "";
    }
    isPlayingRef.current = false;
  }

  function playNext() {
    const next = ttsQueueRef.current.shift();
    if (!next) {
      isPlayingRef.current = false;
      setState("listening");
      return;
    }

    if (!audioElementRef.current) audioElementRef.current = new Audio();
    const el = audioElementRef.current;

    const bytes = Uint8Array.from(atob(next), (c) => c.charCodeAt(0));
    const blob = new Blob([bytes], { type: "audio/mpeg" });
    const url = URL.createObjectURL(blob);

    wsRef.current?.send(JSON.stringify({ event: "tts_start" }));
    setState("speaking");
    isPlayingRef.current = true;

    el.onended = () => {
      URL.revokeObjectURL(url);
      if (ttsQueueRef.current.length === 0) {
        wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
      }
      playNext();
    };

    el.onerror = () => {
      URL.revokeObjectURL(url);
      if (ttsQueueRef.current.length === 0) {
        wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
      }
      playNext();
    };

    el.src = url;
    el.play().catch(() => {
      URL.revokeObjectURL(url);
      playNext();
    });
  }

  function enqueueTTS(b64: string) {
    ttsQueueRef.current.push(b64);
    if (!isPlayingRef.current) playNext();
  }

  async function handleWebSocketMessage(evt: MessageEvent) {
    let jsonString: string;
    if (typeof evt.data === "string") jsonString = evt.data;
    else if (evt.data instanceof Blob) jsonString = await evt.data.text();
    else return;

    let msg: any;
    try { msg = JSON.parse(jsonString); } catch { return; }

    switch (msg.event) {
      case "ping":
        break;

      case "speech_start": {
        setState("listening");
        break;
      }
      case "speech_end": {
        break;
      }
      case "interrupt": {
        clearTTSQueueAndStop();
        wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
        setState("listening");
        break;
      }

      case "transcript": {
        const text = String(msg.data || "");
        if (text) setMessages((p) => [...p, { role: "user", text }]);
        break;
      }

      case "response_start": {
        setStreamBuf("");
        break;
      }
      case "partial_response": {
        const delta = String(msg.data || "");
        if (delta) setStreamBuf((prev) => prev + delta);
        break;
      }
      case "response_text": {
        const full = String(msg.data || "");
        if (full) setMessages((p) => [...p, { role: "assistant", text: full }]);
        break;
      }
      case "response_done": {
        setStreamBuf("");
        break;
      }

      case "tts_audio": {
        const b64 = String(msg.data || "");
        if (b64) enqueueTTS(b64);
        break;
      }

      case "error": {
        console.error("❌ Error:", msg.data || msg.message);
        break;
      }

      default:
        console.debug("WS:", msg);
    }
  }

  async function startRecording(stream: MediaStream) {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

    // IMPORTANT: enforce mono on the node IO to avoid channel upmix/resample artifacts
    const recorder = new AudioWorkletNode(audioCtx, "recorder-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { targetMs: 48 }, // ~50ms packets
    });

    recorder.port.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === "pcm") {
        const bytes = new Uint8Array(msg.payload);
        const b64 = encodeBase64(bytes); // why: robust, no spread
        if (wsRef.current?.readyState === WebSocket.OPEN && state !== "speaking") {
          wsRef.current.send(JSON.stringify({ event: "pcm_chunk", data: b64 }));
        }
      } else if (msg?.type === "metrics") {
        wsRef.current?.send(
          JSON.stringify({
            event: "metrics",
            frame: msg.frame,
            ctx_sample_rate: msg.ctxSampleRate,
            client_time: msg.clientTime,
          }),
        );
      }
    };

    // Keep graph simple and avoid feedback paths
    source.connect(recorder);
    recorder.connect(audioCtx.destination); // silent; needed on some browsers to drive the node
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    wsRef.current?.send(JSON.stringify({ event: "end_audio" }));
    isRecordingRef.current = false;
  }

  async function preloadWorklet() {
    const audioCtx = getAudioContext();

    const workletCode = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.buffer = new Float32Array(0);
    this.framesSinceMetric = 0;
    this.targetMs = (options?.processorOptions?.targetMs) || 48;
    this.batchFrames = Math.max(128, Math.ceil(sampleRate * (this.targetMs / 1000)));
  }
  process(inputs) {
    const in0 = inputs[0];
    if (!in0 || in0.length === 0) return true;

    // Mixdown all available channels → mono
    const mono = (function mix(inChs){
      const chs = inChs.filter(Boolean);
      if (chs.length === 0) return new Float32Array(0);
      if (chs.length === 1) return chs[0];
      const len = chs[0].length;
      const out = new Float32Array(len);
      const gain = 0.70710678; // why: headroom on sum
      for (let i = 0; i < len; i++) {
        let s = 0;
        for (let c = 0; c < chs.length; c++) s += chs[c][i];
        out[i] = (s * gain) / chs.length;
      }
      return out;
    })(in0);

    if (mono.length) {
      const tmp = new Float32Array(this.buffer.length + mono.length);
      tmp.set(this.buffer, 0);
      tmp.set(mono, this.buffer.length);
      this.buffer = tmp;
    }

    if (this.buffer.length >= this.batchFrames) {
      const i16 = new Int16Array(this.buffer.length);
      for (let i = 0; i < this.buffer.length; i++) {
        const s = Math.max(-1, Math.min(1, this.buffer[i]));
        i16[i] = s * 0x7fff;
      }
      this.port.postMessage({ type: 'pcm', payload: i16.buffer }, [i16.buffer]);
      this.buffer = new Float32Array(0);
    }

    this.framesSinceMetric += mono.length || 0;
    const metricEveryFrames = Math.max(sampleRate / 2, 128 * 20);
    if (this.framesSinceMetric >= metricEveryFrames) {
      this.port.postMessage({
        type: 'metrics',
        frame: currentFrame,
        ctxSampleRate: sampleRate,
        clientTime: currentTime,
      });
      this.framesSinceMetric = 0;
    }

    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`;

    const blob = new Blob([workletCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(url);
    console.log("🧩 AudioWorklet loaded (mono mixdown, batched PCM + metrics)");
  }

  function startWebSocketAndRecording() {
    if (wsRef.current) return;
    const ws = connectJarvisWebSocket();
    ws.onmessage = handleWebSocketMessage;
    ws.onopen = async () => {
      const audioCtx = getAudioContext();
      await audioCtx.resume();

      const stream = micStreamRef.current;
      if (!stream) {
        setEnabled(false);
        return;
      }

      ws.send(JSON.stringify({ event: "config", sample_rate: audioCtx.sampleRate }));
      console.log(`🎤 Sent config SR: ${audioCtx.sampleRate} Hz`);

      setState("listening");
      ws.send(JSON.stringify({ event: "start_audio" }));
      startRecording(stream);
    };
    ws.onclose = () => {
      setState("idle");
      setStreamBuf("");
      clearTTSQueueAndStop();
      wsRef.current = null;
    };
    ws.onerror = (e) => console.error("WS error", e);
    wsRef.current = ws;
  }

  async function toggleJarvis() {
    if (enabled) {
      stopRecording();
      wsRef.current?.close();
      wsRef.current = null;
      setEnabled(false);
      setState("idle");
      clearTTSQueueAndStop();
      return;
    }

    try {
      const ctx = getAudioContext();
      await ctx.resume();
      createAndUnlockAudioElement();

      // Tip: disabling EC/NS avoids comb-filter artifacts. Re-enable if you rely on laptop speakers.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          channelCount: { ideal: 1, max: 1 },
        },
      });
      micStreamRef.current = stream;

      await preloadWorklet();
      setEnabled(true);
    } catch (err) {
      console.error(err);
      setEnabled(false);
      setState("idle");
    }
  }

  useEffect(() => {
    if (enabled) startWebSocketAndRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return (
    <JarvisContext.Provider
      value={{ enabled, state, setEnabled: toggleJarvis, setState, messages, streamBuf }}
    >
      {children}
    </JarvisContext.Provider>
  );
}

export function useJarvis() {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvis must be used inside JarvisProvider");
  return ctx;
}
