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
  const currentPlaybackRef = useRef<HTMLAudioElement | null>(null);

  function getAudioContext() {
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE });
      audioContextRef.current = ctx;
    }
    return ctx;
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
    } else {
      return;
    }

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
        if (currentPlaybackRef.current) {
          try {
            currentPlaybackRef.current.pause();
          } catch {}
          currentPlaybackRef.current = null;
        }
        setState("listening");
        break;
      case "response_text":
        console.log("🤖 Response:", msg.data);
        break;
      case "tts_audio":
        getAudioContext().resume().then(() => {
          const audioBytes = Uint8Array.from(atob(msg.data), c =>
            c.charCodeAt(0)
          );
          const blob = new Blob([audioBytes], { type: "audio/mpeg" });
          const url = URL.createObjectURL(blob);
          const audio = new Audio(url);
          currentPlaybackRef.current = audio;

          wsRef.current?.send(JSON.stringify({ event: "tts_start" }));

          audio.onplay = () => setState("speaking");
          audio.onended = () => {
            wsRef.current?.send(JSON.stringify({ event: "tts_end" }));
            setState("idle");
            currentPlaybackRef.current = null;
          };

          audio.play().catch(err => console.error("❌ Audio play() error:", err));
        });
        break;
      default:
        break;
    }
  }

  async function startRecording(stream: MediaStream) {
    if (isRecordingRef.current) return;
    isRecordingRef.current = true;

    const audioCtx = getAudioContext();
    const source = audioCtx.createMediaStreamSource(stream);

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

    const recorder = new AudioWorkletNode(audioCtx, "recorder-processor");
    recorder.connect(audioCtx.destination);

    recorder.port.onmessage = e => {
      const bytes = new Uint8Array(e.data);
      const b64 = btoa(String.fromCharCode(...bytes));
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ event: "pcm_chunk", data: b64 }));
      }
    };

    source.connect(recorder);
  }

  function stopRecording() {
    if (!isRecordingRef.current) return;
    wsRef.current?.send(JSON.stringify({ event: "end_audio" }));
    isRecordingRef.current = false;
  }

  function startWebSocketAndRecording() {
    if (wsRef.current) return;

    const ws = connectJarvisWebSocket();
    ws.onmessage = handleWebSocketMessage;
    ws.onopen = async () => {
      await getAudioContext().resume();
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then(stream => {
          setState("listening");
          ws.send(JSON.stringify({ event: "start_audio" }));
          startRecording(stream);
        })
        .catch(() => setEnabled(false));
    };
    wsRef.current = ws;
  }

  function toggleJarvis() {
    if (enabled) {
      stopRecording();
      wsRef.current?.close();
      wsRef.current = null;
      setEnabled(false);
      setState("idle");
    } else {
      getAudioContext()
        .resume()
        .then(() => {
          setEnabled(true);
        });
    }
  }

  useEffect(() => {
    if (enabled) {
      startWebSocketAndRecording();
    }
  }, [enabled]);

  return (
    <JarvisContext.Provider value={{ enabled, state, setEnabled: toggleJarvis, setState }}>
      {children}
    </JarvisContext.Provider>
  );
}

export function useJarvis() {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvis must be used inside JarvisProvider");
  return ctx;
}
