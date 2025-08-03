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
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Nullable AudioContext ref
  const audioContextRef = useRef<AudioContext | null>(null);
  // Lazily create & resume on first user gesture
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

  // Silence detection (same as before)
  const startSilenceDetection = (stream: MediaStream) => {
    const audioContext = getAudioContext();
    const analyser = audioContext.createAnalyser();
    const micSource = audioContext.createMediaStreamSource(stream);
    micSource.connect(analyser);
    const dataArray = new Uint8Array(analyser.fftSize);
    const SILENCE_THRESHOLD = 5;
    const SILENCE_DURATION = 1500;

    const checkSilence = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((s, v) => s + v, 0) / dataArray.length;
      if (avg < SILENCE_THRESHOLD) {
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(stopRecording, SILENCE_DURATION);
        }
      } else {
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      }
      requestAnimationFrame(checkSilence);
    };
    checkSilence();
  };

  // Stop the recorder
  const stopRecording = () => {
    const rec = mediaRecorderRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  };

  // Kick off recording/upload/playback
  const startRecording = (stream: MediaStream) => {
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = async () => {
      setState("speaking");
      const blob = new Blob(chunks, { type: "audio/wav" });
      let result;
      try {
        result = await sendJarvisAudio(blob);
      } catch (e) {
        console.error("Error sending audio:", e);
        setState("idle");
        return;
      }

      // **New:** fetch MP3 blob then play via AudioContext
      try {
        const mp3Blob = await fetchJarvisAudioBlob();
        const arrayBuffer = await mp3Blob.arrayBuffer();
        const ctx = getAudioContext();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
        const src = ctx.createBufferSource();
        src.buffer = audioBuffer;
        src.connect(ctx.destination);
        src.start(0);
      } catch (e) {
        console.error("Error decoding/playing TTS buffer:", e);
      } finally {
        setState("listening");
        // restart recording
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((s) => startRecording(s))
          .catch(() => setEnabled(false));
      }
    };

    recorder.start();
    startSilenceDetection(stream);
  };

  // Effect: run once after user taps “enable Jarvis”
  useEffect(() => {
    if (!enabled) return;
    // unlock AudioContext here
    getAudioContext();
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        setState("listening");
        startRecording(stream);
      })
      .catch((err) => {
        console.error("Mic denied:", err);
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
