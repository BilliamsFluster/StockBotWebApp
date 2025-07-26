// File: speechAssistant.ts

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

export async function getBrowserVoices(): Promise<SpeechSynthesisVoice[]> {
  const synth = window.speechSynthesis;
  let voices = synth.getVoices();

  if (voices.length) return voices;

  return new Promise((resolve) => {
    const handler = () => {
      voices = synth.getVoices();
      synth.removeEventListener('voiceschanged', handler);
      resolve(voices);
    };
    synth.addEventListener('voiceschanged', handler);
  });
}

export function speakWithBrowser(text: string, voice?: SpeechSynthesisVoice): Promise<void> {
  return new Promise((resolve) => {
    if (!('speechSynthesis' in window)) return resolve();

    const u = new SpeechSynthesisUtterance(text);
    u.lang = voice?.lang ?? 'en-US';
    if (voice) u.voice = voice;

    u.onend = () => resolve();
    u.onerror = () => resolve(); // treat interrupted as success
    speechSynthesis.speak(u);
  });
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
  return new Promise((resolve) => {
    src.onended = () => resolve();
    src.start();
  });
}

const SR = typeof window !== 'undefined'
  ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  : null;

/**
 * Full voice loop: STT → askJarvis → TTS → loop again
 */
export function startVoiceAssistant(
  user: User,
  onUser: (text: string) => void,
  onJarvis: (text: string) => void,
  getTtsVoice: () => SpeechSynthesisVoice | string | undefined,
  onThinking?: (active: boolean) => void
): () => void {
  if (!SR || !user) return () => {};

  const recognition = new SR();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.lang = 'en-US';

  let stopped = false;
  let speaking = false;
  let listening = false;

  const cancelSpeech = () => {
    if (speechSynthesis.speaking) speechSynthesis.cancel();
  };

  const listen = () => {
    if (stopped || speaking || listening) return;
    try {
      recognition.start();
      listening = true;
    } catch {
      setTimeout(() => {
        listening = false;
        listen();
      }, 300);
    }
  };

  recognition.onresult = async (evt: any) => {
    const txt = evt.results[0][0].transcript.trim();
    if (!txt) return listen();

    onUser(txt);
    speaking = true;
    listening = false;
    recognition.stop();
    cancelSpeech();

    let reply = 'No response';
    try {
      onThinking?.(true);
      const { response, error } = await askJarvis(txt, user);
      reply = response || error || reply;
    } catch {
      reply = '⚠️ Voice input failed.';
    } finally {
      onThinking?.(false);
    }

    onJarvis(reply);

    const ttsVoice = getTtsVoice();
    try {
      if (typeof ttsVoice === 'string') {
        await playTtsBuffer(reply, ttsVoice);
      } else {
        await speakWithBrowser(reply, ttsVoice);
      }
    } catch (err) {
      console.warn('TTS error:', err);
    }

    speaking = false;
    listen();
  };

  recognition.onerror = (e: any) => {
    console.warn('🟡 STT error:', e.error);
    listening = false;

    if (!stopped) {
      if (['no-speech', 'network', 'audio-capture'].includes(e.error)) {
        setTimeout(listen, 600);
      } else {
        setTimeout(listen, 1500);
      }
    }
  };

  recognition.onend = () => {
    listening = false;
    if (!stopped && !speaking) {
      listen();
    }
  };

  listen();
  return () => {
    stopped = true;
    recognition.stop();
    cancelSpeech();
  };
}
