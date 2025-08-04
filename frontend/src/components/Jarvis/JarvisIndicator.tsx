// src/components/Jarvis/JarvisIndicator.tsx
"use client";
import React from "react";

type Props = {
  state: "idle" | "listening" | "speaking";
};

export default function JarvisIndicator({ state }: Props) {
  switch (state) {
    case "listening":
      // Pulsing microphone waves
      return (
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping"></span>
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping delay-150"></span>
          <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping delay-300"></span>
        </div>
      );
    case "speaking":
      // Equalizer bars
      return (
        <div className="flex gap-[2px] items-end">
          <span className="w-1 bg-green-500 animate-[equalizer_0.8s_ease-in-out_infinite]"></span>
          <span className="w-1 bg-green-500 animate-[equalizer_0.6s_ease-in-out_infinite_0.2s]"></span>
          <span className="w-1 bg-green-500 animate-[equalizer_0.7s_ease-in-out_infinite_0.4s]"></span>
        </div>
      );
    case "idle":
    default:
      // Dots fading in/out
      return (
        <div className="flex gap-1">
          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce"></span>
          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-150"></span>
          <span className="w-2 h-2 bg-purple-500 rounded-full animate-bounce delay-300"></span>
        </div>
      );
  }
}
