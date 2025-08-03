"use client";
import { createContext, useContext, useState, ReactNode, useEffect, useRef } from "react";
import { sendJarvisAudio } from "@/api/jarvisApi"; // <-- your axios helper

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
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const silenceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Helper: detects silence
  const startSilenceDetection = (stream: MediaStream) => {
    const audioContext = new AudioContext();
    const analyser = audioContext.createAnalyser();
    const micSource = audioContext.createMediaStreamSource(stream);
    micSource.connect(analyser);

    const dataArray = new Uint8Array(analyser.fftSize);
    const SILENCE_THRESHOLD = 5; // volume threshold
    const SILENCE_DURATION = 1500; // ms

    const checkSilence = () => {
      analyser.getByteFrequencyData(dataArray);
      const avgVolume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;

      if (avgVolume < SILENCE_THRESHOLD) {
        // Start silence timer
        if (!silenceTimeoutRef.current) {
          silenceTimeoutRef.current = setTimeout(() => {
            console.log("⏸ Detected long silence, stopping recording...");
            stopRecordingAndSend();
          }, SILENCE_DURATION);
        }
      } else {
        // Reset silence timer
        if (silenceTimeoutRef.current) {
          clearTimeout(silenceTimeoutRef.current);
          silenceTimeoutRef.current = null;
        }
      }

      requestAnimationFrame(checkSilence);
    };

    checkSilence();
  };

  // Start recording
  const startRecording = (stream: MediaStream) => {
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    const chunks: Blob[] = [];

    recorder.ondataavailable = (e) => chunks.push(e.data);

    recorder.onstop = async () => {
      const audioBlob = new Blob(chunks, { type: "audio/wav" });
      setState("speaking");
      console.log("🎤 Sending audio to Jarvis...");
      try {
        const result = await sendJarvisAudio(audioBlob);
        console.log("📜 Transcript:", result.transcript);
        console.log("🤖 Response:", result.response_text);
        const audio = new Audio(`${process.env.NEXT_PUBLIC_BACKEND_URL}${result.audio_file_url}`);
        audio.play();
      } catch (err) {
        console.error("❌ Error sending audio:", err);
      } finally {
        setState("listening"); // Go back to listening mode
        startRecording(stream); // Start listening again automatically
      }
    };

    recorder.start();
    startSilenceDetection(stream);
  };

  const stopRecordingAndSend = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  // Watch for Jarvis being enabled/disabled
  useEffect(() => {
  if (!enabled) return;

  // ✅ Only run in the browser
  if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then((stream) => {
        mediaStreamRef.current = stream;
        setState("listening");
        console.log("🎤 Mic enabled, Jarvis is listening");
        startRecording(stream);
      })
      .catch((err) => {
        console.error("❌ Mic permission denied:", err);
        setEnabled(false);
      });
  } else {
    console.error("❌ navigator.mediaDevices.getUserMedia is not available in this environment.");
    setEnabled(false);
  }
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
