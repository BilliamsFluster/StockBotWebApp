"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { applyDomActions } from "@/utils/applyDomActions";

declare global {
  interface Window {
    applyDomActions?: typeof applyDomActions;
    __jarvisNavPush?: (to: string) => boolean;
    __jarvisNavReplace?: (to: string) => boolean;
  }
}

export default function DebugBridge() {
  const router = useRouter();

  useEffect(() => {
    // Expose the DOM executor for console + agent usage
    window.applyDomActions = applyDomActions;

    // SPA-first navigation bridges (used by applyDomActions "navigate")
    window.__jarvisNavPush = (to: string) => {
      try {
        if (!to) return false;
        const url = new URL(to, location.origin);
        const path = url.pathname + url.search + url.hash;
        if (path === location.pathname + location.search + location.hash) return true;
        router.push(path);
        return true;
      } catch {
        return false;
      }
    };
    window.__jarvisNavReplace = (to: string) => {
      try {
        if (!to) return false;
        const url = new URL(to, location.origin);
        const path = url.pathname + url.search + url.hash;
        router.replace(path);
        return true;
      } catch {
        return false;
      }
    };

    return () => {
      delete window.applyDomActions;
      delete window.__jarvisNavPush;
      delete window.__jarvisNavReplace;
    };
  }, [router]);

  return null;
}
