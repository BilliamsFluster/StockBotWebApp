"use client";
import { useEffect, useRef, useState } from "react";
import { useJarvis } from "@/components/Jarvis/JarvisProvider";
import JarvisIndicator from "@/components/Jarvis/JarvisIndicator";
import { gsap } from "gsap";
import { Draggable } from "gsap/Draggable";

gsap.registerPlugin(Draggable);

export default function JarvisWidget() {
  const { enabled, setEnabled, state } = useJarvis();
  const [showPopup, setShowPopup] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!widgetRef.current) return;

    const el = widgetRef.current;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    gsap.set(el, { x: screenW - 80, y: screenH - 80 });

    Draggable.create(el, {
      type: "x,y",
      inertia: true,
      bounds: window,
      edgeResistance: 0.75,
      onRelease: function () {
        const rect = el.getBoundingClientRect();
        const widgetWidth = rect.width;
        const widgetHeight = rect.height;

        const distances = {
          "top-left": Math.hypot(rect.left, rect.top),
          "top-right": Math.hypot(screenW - rect.right, rect.top),
          "bottom-left": Math.hypot(rect.left, screenH - rect.bottom),
          "bottom-right": Math.hypot(screenW - rect.right, screenH - rect.bottom),
        };

        const closestCorner = Object.entries(distances).reduce((a, b) =>
          a[1] < b[1] ? a : b
        )[0] as keyof typeof distances;

        let targetX = 0;
        let targetY = 0;

        switch (closestCorner) {
          case "top-left": targetX = 20; targetY = 20; break;
          case "top-right": targetX = screenW - widgetWidth - 20; targetY = 20; break;
          case "bottom-left": targetX = 20; targetY = screenH - widgetHeight - 20; break;
          case "bottom-right":
          default: targetX = screenW - widgetWidth - 20; targetY = screenH - widgetHeight - 20; break;
        }

        gsap.to(el, { x: targetX, y: targetY, duration: 0.35, ease: "elastic.out(1, 0.5)" });
      }
    });
  }, []);

  return (
    <>
      <div
        ref={widgetRef}
        className="fixed w-14 h-14 rounded-full flex flex-col items-center justify-center shadow-lg bg-black/70 cursor-pointer select-none"
        style={{ top: 0, left: 0, zIndex: 9999 }}
        onClick={() => setShowPopup(!showPopup)}
      >
        {enabled ? <JarvisIndicator state={state} /> : <span className="text-xs text-gray-400">Off</span>}
        
      </div>

      {showPopup && (
        <div className="absolute bottom-20 right-4 bg-black/80 p-3 rounded-lg text-white text-sm space-y-2 shadow-lg">
          <button
            className="px-3 py-1 rounded bg-blue-500 hover:bg-blue-600"
            onClick={() => setEnabled(!enabled)}
          >
            {enabled ? "Disable Voice Mode" : "Enable Voice Mode"}
          </button>
        </div>
      )}
    </>
  );
}
