"use client";
import { useJarvis } from "@/components/Jarvis/JarvisProvider";

export default function JarvisPopup() {
  const { enabled, setEnabled } = useJarvis();

  return (
    <div className="fixed bottom-20 right-5 bg-base-200 shadow-lg rounded-lg p-4 w-56 z-50 border border-base-300">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Enable Jarvis</span>
        <input
          type="checkbox"
          className="toggle toggle-primary"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </div>
    </div>
  );
}
