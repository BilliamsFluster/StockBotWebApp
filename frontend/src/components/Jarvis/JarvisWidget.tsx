"use client";
import { useEffect, useRef, useState } from "react";
import { useJarvis } from "@/components/Jarvis/JarvisProvider";
import JarvisPopup from "@/components/Jarvis/JarvisPopup";
import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";

gsap.registerPlugin(Draggable);

export default function JarvisWidget() {
  const { enabled, state } = useJarvis();
  const [showPopup, setShowPopup] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!widgetRef.current) return;

    const el = widgetRef.current;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    // Set starting position (bottom-right corner)
    const startX = screenW - 80; // widget width (48px) + margin (20px) + buffer
    const startY = screenH - 80;
    gsap.set(el, { x: startX, y: startY });

    Draggable.create(el, {
      type: "x,y",
      inertia: true, // smooth momentum stop
      bounds: window,
      edgeResistance: 0.75,
      onRelease: function () {
        const rect = el.getBoundingClientRect();
        const widgetWidth = rect.width;
        const widgetHeight = rect.height;

        // Distances to corners
        const distances = {
          "top-left": Math.hypot(rect.left, rect.top),
          "top-right": Math.hypot(screenW - rect.right, rect.top),
          "bottom-left": Math.hypot(rect.left, screenH - rect.bottom),
          "bottom-right": Math.hypot(screenW - rect.right, screenH - rect.bottom),
        };

        // Find closest corner
        const closestCorner = Object.entries(distances).reduce((a, b) =>
          a[1] < b[1] ? a : b
        )[0] as keyof typeof distances;

        let targetX = 0;
        let targetY = 0;

        switch (closestCorner) {
          case "top-left":
            targetX = 20;
            targetY = 20;
            break;
          case "top-right":
            targetX = screenW - widgetWidth - 20;
            targetY = 20;
            break;
          case "bottom-left":
            targetX = 20;
            targetY = screenH - widgetHeight - 20;
            break;
          case "bottom-right":
          default:
            targetX = screenW - widgetWidth - 20;
            targetY = screenH - widgetHeight - 20;
            break;
        }

        // Snap with a nice bounce
        gsap.to(el, {
          x: targetX,
          y: targetY,
          duration: 0.35,
          ease: "elastic.out(1, 0.5)"
        });
      }
    });
  }, []);

  const getStateColor = () => {
  if (!enabled) return "bg-gray-500"; // Disabled

  switch (state) {
    case "listening":
      return "bg-blue-500 animate-pulse"; // Listening
    case "speaking":
      return "bg-green-500 animate-pulse"; // Speaking
    default:
      return "bg-purple-500"; // Idle
  }
};


  return (
    <>
      <div
        ref={widgetRef}
        className={`fixed w-12 h-12 rounded-full flex items-center justify-center shadow-lg text-white ${getStateColor()}`}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          cursor: "grab",
          zIndex: 9999
        }}
        onClick={() => setShowPopup(!showPopup)}
      >
        🎤
      </div>
      {showPopup && <JarvisPopup />}
    </>
  );
}
