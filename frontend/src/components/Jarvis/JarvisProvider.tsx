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

const TARGET_SAMPLE_RATE = 16000;

type JarvisState = "idle" | "listening" | "speaking";

interface JarvisContextProps {
  enabled: boolean;
  state: JarvisState;
  setEnabled: (v: boolean) => void;
  setState: (s: JarvisState) => void;
}

const JarvisContext = createContext<JarvisContextProps | undefined>(undefined);

export function JarvisProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [state, setState] = useState<JarvisState>("idle");

  const audioContextRef = useRef<AudioContext | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const isRecordingRef = useRef(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

  function getAudioContext() {
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = ctx;
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

  async function handleWebSocketMessage(evt: MessageEvent) {
    let jsonString: string;
    if (typeof evt.data === "string") {
      jsonString = evt.data;
    } else if (evt.data instanceof Blob) {
      try {
        jsonString = await evt.data.text();
      } catch {
        return;
      }
    } else return;

    let msg: any;
    try {
      msg = JSON.parse(jsonString);
    } catch {
      return;
    }

    switch (msg.event) {
      case "speech_start":
        setState("listening");
        break;
      case "speech_end":
        setState("idle");
        break;
      case "interrupt":
        if (audioElementRef.current) {
          try { audioElementRef.current.pause(); } catch {}
        }
        setState("listening");
        break;
      case "response_text":
        console.log("🤖 Response:", msg.data);
        break;
      case "tts_audio":
        if (state === "listening") return; // prevent speaking over listening
        const audioBytes = Uint8Array.from(atob(msg.data), c => c.charCodeAt(0));
        const blob = new Blob([audioBytes], { type: "audio/mpeg" });
        const url = URL.createObjectURL(blob);
        if (audioElementRef.current) {
          wsRef.current?.send(JSON.stringify({ event: "tts_start" }));
          audioElementRef.current.src = url;
          audioElementRef.current.onplay = () => setState("speaking");
          audioElementRef.current.onended = () => {
            wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
            setState("idle");
          };
          audioElementRef.current.play().catch(err => console.error("❌ play() error:", err));
        }
        break;
    }
  }

  async function startRecording(stream: MediaStream) {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

    if (audioCtx.audioWorklet) {
      const recorder = new AudioWorkletNode(audioCtx, "recorder-processor");
      recorder.port.onmessage = e => {
        const bytes = new Uint8Array(e.data);
        const b64 = btoa(String.fromCharCode(...bytes));
        if (wsRef.current?.readyState === WebSocket.OPEN && state !== "speaking") {
          wsRef.current.send(JSON.stringify({ event: "pcm_chunk", data: b64 }));
        }
      };
      source.connect(recorder);
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    wsRef.current?.send(JSON.stringify({ event: "end_audio" }));
    isRecordingRef.current = false;
  }

  async function preloadWorklet() {
    const audioCtx = getAudioContext();
    if (!audioCtx.audioWorklet) return;
    const workletCode = `
      class RecorderProcessor extends AudioWorkletProcessor {
        process(inputs) {
          const inCh = inputs[0];
          if (inCh && inCh[0].length) {
            const f32 = inCh[0];
            const i16 = new Int16Array(f32.length);
            for (let i = 0; i < f32.length; i++) {
              const s = Math.max(-1, Math.min(1, f32[i]));
              i16[i] = s * 0x7FFF;
            }
            this.port.postMessage(i16.buffer, [i16.buffer]);
          }
          return true;
        }
      }
      registerProcessor('recorder-processor', RecorderProcessor);
    `;
    const blob = new Blob([workletCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    await audioCtx.audioWorklet.addModule(url);
  }

  function startWebSocketAndRecording() {
    if (wsRef.current) return;

    const ws = connectJarvisWebSocket();
    ws.onmessage = handleWebSocketMessage;
    ws.onopen = async () => {
      await getAudioContext().resume();
      const stream = micStreamRef.current;
      if (!stream) {
        setEnabled(false);
        return;
      }
      setState("listening");
      ws.send(JSON.stringify({ event: "start_audio" }));
      startRecording(stream);
    };
    wsRef.current = ws;
  }

  async function toggleJarvis() {
    if (enabled) {
      stopRecording();
      wsRef.current?.close();
      wsRef.current = null;
      setEnabled(false);
      setState("idle");
      return;
    }

    try {
      const ctx = getAudioContext();
      await ctx.resume();
      createAndUnlockAudioElement();

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          channelCount: 1,
          sampleRate: TARGET_SAMPLE_RATE,
        },
      });
      micStreamRef.current = stream;

      await preloadWorklet();
      setEnabled(true);
    } catch (err) {
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
      value={{
        enabled,
        state,
        setEnabled: toggleJarvis,
        setState,
      }}
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
