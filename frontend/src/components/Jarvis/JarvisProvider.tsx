// src/components/Jarvis/JarvisProvider.tsx
"use client";

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
  useEffect,
  useRef,
} from "react";
import { sendJarvisAudio, fetchJarvisAudioBlob } from "@/api/jarvisApi";

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

  // refs
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const isRecordingRef = useRef(false); // <-- guard

  // Lazily create/resume AudioContext
  function getAudioContext() {
    let ctx = audioContextRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioContextRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      ctx.resume();
    }
    return ctx;
  }

  // Silence detection
  function startSilenceDetection(stream: MediaStream) {
    const ctx = getAudioContext();
    const analyser = ctx.createAnalyser();
    const source = ctx.createMediaStreamSource(stream);
    source.connect(analyser);

    const data = new Uint8Array(analyser.fftSize);
    const THRESH = 5;
    const DURATION = 1500;

    const check = () => {
      analyser.getByteFrequencyData(data);
      const avg = data.reduce((s, v) => s + v, 0) / data.length;

      if (avg < THRESH) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(stopRecording, DURATION);
        }
      } else {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      }
      requestAnimationFrame(check);
    };

    check();
  }

  // Stop the recorder
  function stopRecording() {
    if (mediaRecorderRef.current && isRecordingRef.current) {
      mediaRecorderRef.current.stop();
    }
  }

  // Start recording if not already recording
  function startRecording(stream: MediaStream) {
    if (isRecordingRef.current) return;            // <--- guard
    isRecordingRef.current = true;                 // <--- set before

    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = async () => {
      isRecordingRef.current = false;              // <--- reset
      setState("speaking");
      const audioBlob = new Blob(chunks, { type: "audio/wav" });

      let result;
      try {
        result = await sendJarvisAudio(audioBlob);
      } catch (e) {
        console.error("Error sending audio:", e);
        setState("idle");
        return;
      }

      try {
        const mp3 = await fetchJarvisAudioBlob();
        const buf = await mp3.arrayBuffer();
        const ctx = getAudioContext();
        const audioBuffer = await ctx.decodeAudioData(buf);
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(ctx.destination);
        src.start();
      } catch (e) {
        console.error("Error decoding/playing TTS buffer:", e);
      } finally {
        setState("listening");
        // clear any pending silence timer before next recording
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
        // start next capture
        startRecording(stream);
      }
    };

    recorder.start();
    startSilenceDetection(stream);
  }

  // On “enable” user gesture
  useEffect(() => {
    if (!enabled) return;

    getAudioContext(); // unlock audio

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream;
        setState("listening");
        startRecording(stream);
      })
      .catch((err) => {
        console.error("Mic permission denied:", err);
        setEnabled(false);
      });
  }, [enabled]);

  return (
    <JarvisContext.Provider value={{ enabled, state, setEnabled, setState }}>
      {children}
    </JarvisContext.Provider>
  );
}

export function useJarvis() {
  const ctx = useContext(JarvisContext);
  if (!ctx) throw new Error("useJarvis must be used inside JarvisProvider");
  return ctx;
}
