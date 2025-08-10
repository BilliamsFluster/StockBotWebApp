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
  speaker?: string; // <-- ADDED: Optional speaker field
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
  const audioProcessorNodeRef = useRef<AudioWorkletNode | null>(null);
  const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const ttsQueueRef = useRef<string[]>([]);
  const ttsGainRef = useRef<GainNode | null>(null);
  const ttsSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const isPlayingRef = useRef(false);
  const ttsTokenRef = useRef(0);
  const dropUntilResponseStartRef = useRef(false);

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
    if (!inputGainRef.current) return;
    const g = inputGainRef.current.gain;
    // --- MODIFIED: Gentler ducking as per your plan ---
    const target = duck ? 0.4 : 1.0;
    const t = ctx.currentTime;
    g.cancelScheduledValues(t);
    g.setTargetAtTime(target, t, 0.05);
  }

  function clearTTSQueueAndStop({ sendEnd = false }: { sendEnd?: boolean } = {}) {
    ttsQueueRef.current = [];
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    // --- THIS IS THE FIX, mimicking your old project's logic ---
    if (ttsGainRef.current) {
      const g = ttsGainRef.current.gain;
      g.cancelScheduledValues(now);
      // 1. Instantly set volume to 0 (like .pause())
      g.setValueAtTime(0, now);
    }
    // 2. Stop all playing sources and disconnect them (like .src = "")
    for (const src of ttsSourcesRef.current) {
      try {
        src.stop(now); 
      } catch {}
      try { src.disconnect(); } catch {}
    }
    ttsSourcesRef.current.clear();
    // --- End of fix ---

    isPlayingRef.current = false;
    ttsTokenRef.current++;
    // --- MODIFIED: Only send tts_end if requested, to avoid race conditions ---
    if (sendEnd) {
        wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
    }
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
      if (myToken !== ttsTokenRef.current) return;

      const src = ctx.createBufferSource();
      src.buffer = audioBuffer;
      src.connect(ttsGainRef.current!);

      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        setState("speaking");
        setInputDuck(true);
        // --- MODIFIED: Send tts_start as per your plan ---
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
      case "transcript": {
        // --- MODIFIED: Handle the new speaker field ---
        const text = String(msg.data || "");
        const speaker = String(msg.speaker || ""); // Get the speaker ID
        if (text) {
          // Add the speaker to the message object
          setMessages((p) => [...p, { role: "user", text, speaker }]);
        }
        break;
      }
      case "response_start": {
        dropUntilResponseStartRef.current = false;
        setStreamBuf("");
        clearTTSQueueAndStop({ sendEnd: false });
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
        if (dropUntilResponseStartRef.current) break;
        const b64 = String(msg.data || "");
        if (b64) enqueueTTS(b64);
        break;
      }
      // --- THIS IS THE FIX ---
      // Add this case to handle the interrupt event from the server
      case "interrupt": {
        console.log("🛑 Interrupt received (from server), stopping TTS.");
        clearTTSQueueAndStop();
        break;
      }
      case "error":
        console.error("❌ Error:", msg.data || msg.message);
        break;
    }
  }

  async function startRecording(stream: MediaStream) {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    micSourceNodeRef.current = source;

    if (!inputGainRef.current) inputGainRef.current = audioCtx.createGain();

    const recorder = new AudioWorkletNode(audioCtx, "recorder-processor", {
      processorOptions: {
        sampleRate: audioCtx.sampleRate,
        // --- NEW: Pass RMS calculation options to worklet ---
        rmsWindowSize: 20, // ms
        rmsCallbackInterval: 60, // ms
      },
    });
    audioProcessorNodeRef.current = recorder;

    // --- NEW: Local Barge-in Logic ---
    let bargeInCounter = 0;
    const BARGE_IN_THRESHOLD = 0.08; // RMS threshold for barge-in
    const BARGE_IN_MIN_COUNT = 1; // How many consecutive RMS samples must be over threshold

    recorder.port.onmessage = (e) => {
      const msg = e.data;
      if (msg?.type === "audio_chunk") {
        const bytes = new Uint8Array(msg.payload);
        const b64 = encodeBase64(bytes);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ event: "audio_chunk", data: b64 }));
        }
      } else if (msg?.type === "rms") {
        // --- This is our local VAD ---
        if (isPlayingRef.current) {
          if (msg.payload > BARGE_IN_THRESHOLD) {
            bargeInCounter++;
          } else {
            bargeInCounter = 0;
          }

          if (bargeInCounter >= BARGE_IN_MIN_COUNT) {
            console.log("⚡ Local Barge-in triggered!");
            // Instantly mute and flush TTS
            clearTTSQueueAndStop({ sendEnd: false }); 
            // Tell server to stop generating
            wsRef.current?.send(JSON.stringify({ event: "interrupt" }));
            // Ignore any in-flight TTS packets
            dropUntilResponseStartRef.current = true;
            // Un-duck the mic immediately
            setInputDuck(false);
            // Reset counter
            bargeInCounter = 0;
          }
        }
      }
    };

    // Correct Audio Graph: mic -> gain -> worklet (NO connection to speakers)
    source.connect(inputGainRef.current);
    inputGainRef.current.connect(recorder);

    // To keep the AudioContext clock running, we must connect the source to the destination,
    // but we can do it through a silent GainNode.
    const silentGain = audioCtx.createGain();
    silentGain.gain.value = 0;
    source.connect(silentGain);
    silentGain.connect(audioCtx.destination);
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    // Disconnect the audio graph to stop processing
    if (micSourceNodeRef.current && inputGainRef.current) {
        micSourceNodeRef.current.disconnect(inputGainRef.current);
    }
    if (inputGainRef.current && audioProcessorNodeRef.current) {
        inputGainRef.current.disconnect(audioProcessorNodeRef.current);
    }
  }

  async function preloadWorklet() {
    const audioCtx = getAudioContext();
    const workletCode = `
      // --- THIS IS THE FIX ---
      // The resample function must be defined outside the class.
      function resample(input, inputRate, outputRate) {
        if (inputRate === outputRate) return input;
        const ratio = inputRate / outputRate;
        const outputLength = Math.ceil(input.length / ratio);
        const output = new Float32Array(outputLength);
        for (let i = 0; i < outputLength; i++) {
          const before = Math.floor(i * ratio);
          const after = Math.min(before + 1, input.length - 1);
          const atPoint = i * ratio - before;
          output[i] = input[before] + (input[after] - input[before]) * atPoint;
        }
        return output;
      }

      class RecorderProcessor extends AudioWorkletProcessor {
        constructor(options) {
          super();
          this.inputSampleRate = options.processorOptions.sampleRate;
          this.outputSampleRate = 16000;
          this.rmsWindowSize = (this.inputSampleRate * options.processorOptions.rmsWindowSize) / 1000;
          this.rmsCallbackInterval = (this.inputSampleRate * options.processorOptions.rmsCallbackInterval) / 1000;
          this.rmsBuffer = new Float32Array(0);
          this.samplesSinceLastRmsCallback = 0;
          this.buffer = new Float32Array(0);
          this.batchSize = Math.ceil(this.outputSampleRate * 0.048);
        }

        process(inputs) {
          const input = inputs[0]?.[0];
          if (!input) return true;

          // --- RMS Calculation ---
          this.rmsBuffer = Float32Array.of(...this.rmsBuffer.slice(-this.rmsWindowSize), ...input);
          this.samplesSinceLastRmsCallback += input.length;
          if (this.samplesSinceLastRmsCallback >= this.rmsCallbackInterval) {
            this.samplesSinceLastRmsCallback = 0;
            const rms = Math.sqrt(this.rmsBuffer.reduce((s, v) => s + v*v, 0) / this.rmsBuffer.length);
            this.port.postMessage({ type: 'rms', payload: rms });
          }

          // --- Resampling and sending audio chunks (existing logic) ---
          // --- MODIFIED: Call resample directly, not as this.resample ---
          const resampled = resample(input, this.inputSampleRate, this.outputSampleRate);
          const newBuffer = new Float32Array(this.buffer.length + resampled.length);
          newBuffer.set(this.buffer, 0);
          newBuffer.set(resampled, this.buffer.length);
          this.buffer = newBuffer;

          while (this.buffer.length >= this.batchSize) {
            const chunk = this.buffer.subarray(0, this.batchSize);
            this.buffer = this.buffer.subarray(this.batchSize);
            const i16 = new Int16Array(chunk.length);
            for (let i = 0; i < chunk.length; i++) {
              i16[i] = Math.max(-1, Math.min(1, chunk[i])) * 0x7fff;
            }
            this.port.postMessage({ type: 'audio_chunk', payload: i16.buffer }, [i16.buffer]);
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
      ws.send(JSON.stringify({ event: "start" }));
      console.log(`🎤 Recording started. Client resampling from ${audioCtx.sampleRate} Hz to 16000 Hz.`);
      setState("listening");
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
          channelCount: 1,
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
    if (enabled) {
      startWebSocketAndRecording();
    }
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