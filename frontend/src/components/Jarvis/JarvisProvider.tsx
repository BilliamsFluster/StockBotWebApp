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

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[]
    );
  }
  return btoa(binary);
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

  // --- TTS via WebAudio (hard-stop capable) ---
  const ttsQueueRef = useRef<string[]>([]);
  const ttsGainRef = useRef<GainNode | null>(null);
  const ttsSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isPlayingRef = useRef(false);
  const ttsTokenRef = useRef(0); // invalidate in-flight decodes on interrupt
  const dropUntilResponseStartRef = useRef(false); // gate stale tts_audio

  // Mic ducking
  const inputGainRef = useRef<GainNode | null>(null);

  function getAudioContext() {
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new (window.AudioContext ||
        (window as any).webkitAudioContext)({ latencyHint: "interactive" });
      audioContextRef.current = ctx;
      console.log("🔓 AudioContext @", ctx.sampleRate, "Hz");
    }
    return ctx;
  }

  function ensureTtsGraph() {
    const ctx = getAudioContext();
    if (!ttsGainRef.current) {
      ttsGainRef.current = ctx.createGain();
      ttsGainRef.current.gain.value = 1.0;
      ttsGainRef.current.connect(ctx.destination);
    }
  }

  function setInputDuck(duck: boolean) {
    const ctx = getAudioContext();
    if (!inputGainRef.current) inputGainRef.current = ctx.createGain();
    const g = inputGainRef.current.gain;
    const target = duck ? 0.12 : 1.0; // keep some input for VAD/barge‑in
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(target, t, 0.05);
  }

  function clearTTSQueueAndStop({ sendEnd = false }: { sendEnd?: boolean } = {}) {
    ttsQueueRef.current = [];
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    if (ttsGainRef.current) {
      const g = ttsGainRef.current.gain;
      g.cancelScheduledValues(now);
      // Fast fade out instead of immediate stop
      g.setTargetAtTime(0, now, 0.015);
    }
    for (const src of ttsSourcesRef.current) {
      try { src.stop(now + 0.1); } catch {} // Schedule stop slightly in future
      try { src.disconnect(); } catch {}
    }
    ttsSourcesRef.current.clear();
    isPlayingRef.current = false;
    ttsTokenRef.current++;
    if (sendEnd) wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
  }

  async function playNext() {
    const next = ttsQueueRef.current.shift();
    if (!next) {
      isPlayingRef.current = false;
      setState("listening");
      setTimeout(() => setInputDuck(false), 120);
      wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
      return;
    }

    ensureTtsGraph();
    const ctx = getAudioContext();
    const myToken = ++ttsTokenRef.current;

    const bytes = Uint8Array.from(atob(next), (c) => c.charCodeAt(0));
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

    try {
      const audioBuffer = await ctx.decodeAudioData(ab.slice(0));
      if (myToken !== ttsTokenRef.current) return; // interrupted while decoding

      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ttsGainRef.current!);

      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setState("speaking");
        setInputDuck(true);
        wsRef.current?.send(JSON.stringify({ event: "tts_start" }));
        const t = ctx.currentTime;
        ttsGainRef.current!.gain.setValueAtTime(0, t);
        ttsGainRef.current!.gain.linearRampToValueAtTime(1, t + 0.02);
      }

      ttsSourcesRef.current.add(src);
      src.onended = () => {
        ttsSourcesRef.current.delete(src);
        if (ttsSourcesRef.current.size === 0) void playNext();
      };

      src.start();
    } catch (e) {
      console.warn("decode/play failed", e);
      void playNext();
    }
  }

  function enqueueTTS(b64: string) {
    ttsQueueRef.current.push(b64);
    if (!isPlayingRef.current && ttsSourcesRef.current.size === 0) void playNext();
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

      case "speech_start":
        setState("listening");
        break;

      case "interrupt": {
        // Hard-stop and ignore any late TTS until the next response_start
        dropUntilResponseStartRef.current = true;
        clearTTSQueueAndStop({ sendEnd: false });
        setInputDuck(false);
        setState("listening");
        break;
      }

      case "transcript": {
        const text = String(msg.data || "");
        if (text) setMessages((p) => [...p, { role: "user", text }]);
        break;
      }

      case "response_start": {
        // Accept new TTS for this turn and clear leftovers
        dropUntilResponseStartRef.current = false;
        setStreamBuf("");
        clearTTSQueueAndStop({ sendEnd: false });
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

      case "response_done":
        setStreamBuf("");
        break;

      case "tts_audio": {
        if (dropUntilResponseStartRef.current) break; // drop stale audio
        const b64 = String(msg.data || "");
        if (b64) enqueueTTS(b64);
        break;
      }

      case "error":
        console.error("❌ Error:", msg.data || msg.message);
        break;

      default:
        console.debug("WS:", msg);
    }
  }

  async function startRecording(stream: MediaStream) {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

    if (!inputGainRef.current) inputGainRef.current = audioCtx.createGain();

    const recorder = new AudioWorkletNode(audioCtx, "recorder-processor", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      channelInterpretation: "speakers",
      processorOptions: { targetMs: 48 },
    });

    recorder.port.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === "pcm") {
        const bytes = new Uint8Array(msg.payload);
        const b64 = encodeBase64(bytes);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ event: "pcm_chunk", data: b64 }));
        }
      } else if (msg?.type === "metrics") {
        wsRef.current?.send(
          JSON.stringify({
            event: "metrics",
            frame: msg.frame,
            ctx_sample_rate: msg.ctxSampleRate,
            client_time: msg.clientTime,
          })
        );
      }
    };

    // mic -> inputGain (duck) -> worklet -> destination(clock)
    source.connect(inputGainRef.current!);
    inputGainRef.current!.connect(recorder);
    recorder.connect(audioCtx.destination);
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

    const chs = in0.filter(Boolean);
    const mono = (chs.length === 1) ? chs[0] : (() => {
      const len = chs[0].length;
      const out = new Float32Array(len);
      const gain = 0.70710678; // ~-3 dB per doubling
      for (let i = 0; i < len; i++) {
        let s = 0; for (let c = 0; c < chs.length; c++) s += chs[c][i];
        out[i] = (s * gain) / chs.length;
      }
      return out;
    })();

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
    console.log("🧩 AudioWorklet loaded");
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
      setInputDuck(false);
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
      setInputDuck(false);
      return;
    }

    try {
      const ctx = getAudioContext();
      await ctx.resume();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: false,
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