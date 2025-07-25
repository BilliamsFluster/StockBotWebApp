// File: src/api/speechAssistant.ts
import { askJarvis } from '@/api/jarvisApi';

type User = Parameters<typeof askJarvis>[1];

let audioCtx: AudioContext | null = null;
let primed = false;

async function ensureAudioContext(): Promise<AudioContext> {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }
  return audioCtx;
}

export function primeAudio(): void {
  if (primed) return;
  primed = true;
  ensureAudioContext().then((ctx) => {
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
      document.body.addEventListener('touchend', () => void ctx.resume(), { once: true });
    }
  });
}

export function getBrowserVoices(): SpeechSynthesisVoice[] {
  return window.speechSynthesis.getVoices();
}

export function speakWithBrowser(text: string, voice?: SpeechSynthesisVoice): void {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? 'en-US';
  if (voice) u.voice = voice;
  window.speechSynthesis.speak(u);
}

export function getTtsUrl(text: string, voice: string): string {
  return `/api/tts?${new URLSearchParams({ text, voice }).toString()}`;
}

export async function playTtsBuffer(text: string, voice: string): Promise<void> {
  primeAudio();
  const ctx = await ensureAudioContext();
  const res = await fetch(getTtsUrl(text, voice));
  const arr = await res.arrayBuffer();
  const buf = await ctx.decodeAudioData(arr);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start();
}

const SR = typeof window !== 'undefined'
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : null;

/**
 * STT → askJarvis → append to chat → TTS.
 * onUser and onJarvis are callbacks to push into your UI.
 * getTtsVoice returns either a SpeechSynthesisVoice or a cloud‐voice string.
 */
export function startVoiceAssistant(
  user: User,
  onUser: (text: string) => void,
  onJarvis: (text: string) => void,
  getTtsVoice: () => SpeechSynthesisVoice | string | undefined
): () => void {
  if (!SR || !user) return () => {};

  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  let stopped = false;
  let speaking = false;

  const listen = () => {
    if (stopped || speaking) return;
    try { recognition.start(); }
    catch { setTimeout(listen, 300); }
  };

  recognition.onresult = async (evt: any) => {
    const txt = evt.results[0][0].transcript.trim();
    if (!txt) return listen();
    onUser(txt);

    speaking = true;
    recognition.stop();

    // Query Jarvis
    let reply = 'No response';
    try {
      const { response, error } = await askJarvis(txt, user);
      reply = response || error || reply;
    } catch {
      reply = '⚠️ Voice input failed.';
    }
    onJarvis(reply);

    // TTS
    const ttsVoice = getTtsVoice();
    if (typeof ttsVoice === 'string') {
      await playTtsBuffer(reply, ttsVoice);
    } else {
      speakWithBrowser(reply, ttsVoice);
    }

    speaking = false;
    listen();
  };

  recognition.onerror = (e: any) => {
    console.error('STT error:', e.error);
    if (!stopped) setTimeout(listen, 800);
  };

  listen();
  return () => {
    stopped = true;
    recognition.stop();
  };
}
