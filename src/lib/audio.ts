import { Accent } from '../types';

const audioUrlCache = new Map<string, string | null>();
let currentAudio: HTMLAudioElement | null = null;

/**
 * پخش هوشمند تلفظ انگلیسی:
 * ۱) برای تک‌کلمه‌ها در صورت آنلاین بودن، فایل صوتی واقعی انسانی (US/UK) از Free Dictionary API می‌گیرد.
 * ۲) برای جملات، عبارات یا حالت آفلاین، بی‌وقفه از موتور داخلی speechSynthesis استفاده می‌کند.
 */
export async function playPronunciation(
  text: string,
  accent: Accent = 'en-US'
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }

  // فقط برای تک‌کلمه انگلیسی ساده سراغ فایل MP3 دیکشنری برو
  const isSingleWord = /^[a-zA-Z][a-zA-Z'-]{1,28}$/.test(clean);
  if (isSingleWord && typeof navigator !== 'undefined' && navigator.onLine) {
    const cacheKey = `${clean.toLowerCase()}|${accent}`;
    let mp3Url = audioUrlCache.get(cacheKey);

    if (mp3Url === undefined) {
      mp3Url = await fetchDictionaryAudioUrl(clean.toLowerCase(), accent);
      audioUrlCache.set(cacheKey, mp3Url);
    }

    if (mp3Url) {
      try {
        const audio = new Audio(mp3Url);
        currentAudio = audio;
        await audio.play();
        return;
      } catch {
        // Fallback به speechSynthesis
      }
    }
  }

  speakWithBrowser(clean, accent);
}

interface DictPhonetic {
  audio?: string;
}
interface DictEntry {
  phonetics?: DictPhonetic[];
}

async function fetchDictionaryAudioUrl(
  word: string,
  accent: Accent
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 3500);
    const res = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      { signal: controller.signal }
    );
    window.clearTimeout(timer);

    if (!res.ok) return null;
    const data = (await res.json()) as DictEntry[];
    const audios: string[] = [];

    for (const entry of data) {
      for (const p of entry.phonetics || []) {
        if (p.audio && p.audio.startsWith('http')) {
          audios.push(p.audio);
        }
      }
    }

    if (!audios.length) return null;
    const tag = accent === 'en-GB' ? '-uk' : '-us';
    const preferred = audios.find((u) => u.toLowerCase().includes(tag));
    return preferred || audios[0];
  } catch {
    return null;
  }
}

function speakWithBrowser(text: string, accent: Accent): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = accent;
  utter.rate = 0.92;
  window.speechSynthesis.speak(utter);
}

// =====================================================
// تبدیل گفتار به متن انگلیسی (Voice-to-Note سر کلاس)
// =====================================================

interface SpeechRecInstance {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecCtor = new () => SpeechRecInstance;

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecCtor;
    webkitSpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function isDictationSupported(): boolean {
  return getSpeechRecognitionCtor() !== null;
}

export function startEnglishDictation(
  accent: Accent,
  onText: (transcript: string) => void,
  onError: (msg: string) => void,
  onEnd: () => void
): (() => void) | null {
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) {
    onError('مرورگر شما از تبدیل گفتار به متن پشتیبانی نمی‌کند.');
    return null;
  }

  const rec = new Ctor();
  rec.lang = accent;
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  rec.onresult = (event) => {
    const first = event.results?.[0]?.[0]?.transcript;
    if (first) onText(first.trim());
  };

  rec.onerror = (event) => {
    if (event.error === 'not-allowed') {
      onError('دسترسی میکروفون داده نشده است.');
    } else if (event.error === 'no-speech') {
      onError('صدایی شنیده نشد؛ دوباره تلاش کن.');
    } else {
      onError('خطا در تشخیص گفتار: ' + event.error);
    }
  };

  rec.onend = () => onEnd();
  rec.start();

  return () => {
    try {
      rec.stop();
    } catch {
      // ignore
    }
  };
}
