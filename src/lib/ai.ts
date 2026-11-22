import { CategoryId } from '../types';
import { CATEGORY_MAP } from '../config/categories';

export interface AiEnrichmentResult {
  english: string;
  persian: string;
  meta: string;
  example: string;
  notes: string;
}

interface DictEntry {
  phonetic?: string;
  phonetics?: Array<{ text?: string }>;
  meanings?: Array<{
    partOfSpeech?: string;
    synonyms?: string[];
    definitions?: Array<{
      definition?: string;
      example?: string;
      synonyms?: string[];
    }>;
  }>;
}

interface MyMemoryResponse {
  responseStatus?: number;
  responseData?: { translatedText?: string };
  matches?: Array<{ translation?: string; quality?: number | string }>;
}

const POS_SHORT: Record<string, string> = {
  noun: '(n)',
  verb: '(v)',
  adjective: '(adj)',
  adverb: '(adv)',
  preposition: '(prep)',
  conjunction: '(conj)',
  pronoun: '(pron)',
  interjection: '(interj)'
};

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function parseAiJson(raw: string): Partial<AiEnrichmentResult> {
  const cleaned = raw
    .replace(/^```json\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : cleaned) as Partial<AiEnrichmentResult>;
}

async function translateInstant(
  text: string,
  from: 'en' | 'fa',
  to: 'en' | 'fa'
): Promise<string> {
  const q = text.trim();
  if (!q) return '';
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;
    const res = await fetchWithTimeout(url, { method: 'GET' }, 4000);
    if (!res.ok) return '';
    const data = (await res.json()) as MyMemoryResponse;
    const primary = String(data.responseData?.translatedText || '').trim();

    if (
      primary &&
      !primary.toUpperCase().includes('MYMEMORY WARNING') &&
      primary.toLowerCase() !== q.toLowerCase()
    ) {
      if (to === 'fa' && /[\u0600-\u06FF]/.test(primary)) return primary;
      if (to === 'en' && /[a-zA-Z]/.test(primary)) return primary;
    }

    for (const m of data.matches || []) {
      const cand = String(m.translation || '').trim();
      if (!cand || cand.toLowerCase() === q.toLowerCase()) continue;
      if (to === 'fa' && /[\u0600-\u06FF]/.test(cand)) return cand;
      if (to === 'en' && /[a-zA-Z]/.test(cand)) return cand;
    }
    return primary && !primary.toUpperCase().includes('MYMEMORY WARNING') ? primary : '';
  } catch {
    return '';
  }
}

async function lookupDictionaryInstant(word: string): Promise<{
  meta: string;
  example: string;
  notes: string;
}> {
  const clean = word.trim().toLowerCase();
  if (!/^[a-z][a-z'-]{1,28}$/.test(clean)) {
    return { meta: '', example: '', notes: '' };
  }

  try {
    const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clean)}`;
    const res = await fetchWithTimeout(url, { method: 'GET' }, 3500);
    if (!res.ok) return { meta: '', example: '', notes: '' };

    const list = (await res.json()) as DictEntry[];
    const first = list[0];
    if (!first) return { meta: '', example: '', notes: '' };

    const ipa =
      first.phonetic ||
      (first.phonetics || []).find((p) => p.text && p.text.trim())?.text ||
      '';

    const firstMeaning = (first.meanings || [])[0];
    const rawPos = (firstMeaning?.partOfSpeech || '').toLowerCase();
    const pos = POS_SHORT[rawPos] || (rawPos ? `(${rawPos})` : '');
    const meta = [pos, ipa.trim()].filter(Boolean).join(' ');

    let example = '';
    let englishDef = '';
    const synonymSet = new Set<string>();

    for (const m of first.meanings || []) {
      for (const s of m.synonyms || []) {
        if (synonymSet.size < 4) synonymSet.add(s);
      }
      for (const d of m.definitions || []) {
        if (!englishDef && d.definition) englishDef = d.definition;
        if (!example && d.example) example = d.example;
        for (const s of d.synonyms || []) {
          if (synonymSet.size < 4) synonymSet.add(s);
        }
      }
    }

    const noteParts: string[] = [];
    if (synonymSet.size > 0) {
      noteParts.push(`مترادف‌ها: ${Array.from(synonymSet).join(', ')}`);
    }
    if (englishDef) {
      noteParts.push(`تعریف: ${englishDef}`);
    }

    return {
      meta,
      example,
      notes: noteParts.join('\n')
    };
  } catch {
    return { meta: '', example: '', notes: '' };
  }
}

async function runInstantEngine(
  englishInput: string,
  persianInput: string
): Promise<AiEnrichmentResult | null> {
  let en = englishInput.trim();
  let fa = persianInput.trim();

  if (!en && fa) {
    en = await translateInstant(fa, 'fa', 'en');
  }
  if (!en) return null;

  const [translatedFa, dict] = await Promise.all([
    fa ? Promise.resolve(fa) : translateInstant(en, 'en', 'fa'),
    lookupDictionaryInstant(en)
  ]);

  const finalFa = translatedFa || fa;
  if (!finalFa && !dict.meta && !dict.example) {
    return null;
  }

  return {
    english: en,
    persian: finalFa,
    meta: dict.meta,
    example: dict.example,
    notes: dict.notes
  };
}

function buildPrompt(category: CategoryId, english: string, persian: string): string {
  const cat = CATEGORY_MAP[category];
  const hasEn = english.trim().length > 0;
  const hasFa = persian.trim().length > 0;

  return [
    `You are an elite English-Persian tutor.`,
    `Category: "${cat.enLabel}" (Meta field: "${cat.metaLabel}").`,
    hasEn
      ? `Input English: "${english.trim()}"`
      : `Input Persian (give the most natural English equivalent): "${persian.trim()}"`,
    hasEn && hasFa ? `User Persian note: "${persian.trim()}"` : '',
    `Return ONLY a raw JSON object with exact string keys:`,
    `- "english": clean English entry`,
    `- "persian": concise natural Persian meaning`,
    `- "meta": value for "${cat.metaLabel}" (e.g. "(v) /əˈtʃiːv/" or grammar structure)`,
    `- "example": ONE natural everyday English example sentence`,
    `- "notes": brief Persian study tip or synonyms (max 2 short lines)`
  ]
    .filter(Boolean)
    .join('\n');
}

async function callOpenRouter(key: string, prompt: string): Promise<Partial<AiEnrichmentResult>> {
  const res = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://lexiflow.app',
        'X-Title': 'LexiFlow Notebook'
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        temperature: 0.3,
        messages: [
          {
            role: 'system',
            content: 'Return ONLY a valid JSON object without any extra text or markdown.'
          },
          { role: 'user', content: prompt }
        ]
      })
    },
    6500
  );

  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty OpenRouter response');
  return parseAiJson(content);
}

async function callGemini(key: string, prompt: string): Promise<Partial<AiEnrichmentResult>> {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${encodeURIComponent(key)}`;
  const res = await fetchWithTimeout(
    endpoint,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json'
        }
      })
    },
    5500
  );

  if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
  const data = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return parseAiJson(text);
}

/**
 * موتور ترکیبی و ضدتوقف تکمیل هوشمند:
 * - بدون کلید API: زیر ۱ ثانیه با دیکشنری + مترجم فوری پر می‌شود.
 * - با کلید OpenRouter (sk-or-...) یا Gemini (AIza...): با تایم‌اوت کوتاه اجرا شده
 *   و در صورت شلوغی سرور یا قطعی فیلترشکن، خودکار نتیجه فوری دیکشنری و مترجم را برمی‌گرداند.
 */
export async function enrichWithGemini(params: {
  apiKey: string;
  category: CategoryId;
  english: string;
  persian: string;
}): Promise<AiEnrichmentResult> {
  if (!navigator.onLine) {
    throw new Error('اتصال اینترنت برقرار نیست.');
  }

  const enInput = params.english.trim();
  const faInput = params.persian.trim();
  if (!enInput && !faInput) {
    throw new Error('ابتدا متن انگلیسی یا فارسی را بنویس، سپس دکمه تکمیل هوشمند را بزن.');
  }

  const key = params.apiKey.trim() || (import.meta.env.VITE_GEMINI_API_KEY || '').trim();

  // اجرای هم‌زمان موتور فوری (دیکشنری + مترجم بدون فیلترشکن) در پس‌زمینه
  const instantPromise = runInstantEngine(enInput, faInput);

  // اگر کلیدی وارد نشده باشد، بلافاصله در زیر ۱ ثانیه نتیجه موتور فوری برمی‌گردد
  if (!key) {
    const instant = await instantPromise;
    if (!instant) {
      throw new Error('نتیجه‌ای پیدا نشد. اتصال اینترنت را چک کن یا یک کلید OpenRouter وارد کن.');
    }
    return instant;
  }

  // اگر کلید وجود داشت، مدل هوش مصنوعی با تایم‌اوت کوتاه اجرا می‌شود
  const prompt = buildPrompt(params.category, enInput, faInput);
  try {
    const aiRaw = key.startsWith('sk-or-')
      ? await callOpenRouter(key, prompt)
      : await callGemini(key, prompt);

    const instant = await instantPromise;
    return {
      english: String(aiRaw.english || instant?.english || enInput).trim(),
      persian: String(aiRaw.persian || instant?.persian || faInput).trim(),
      meta: String(aiRaw.meta || instant?.meta || '').trim(),
      example: String(aiRaw.example || instant?.example || '').trim(),
      notes: String(aiRaw.notes || instant?.notes || '').trim()
    };
  } catch {
    // در صورت شلوغی سرور (503)، تایم‌اوت یا خاموش بودن فیلترشکن:
    // بدون نمایش خطا و معطلی، بلافاصله نتیجه آماده موتور فوری را برمی‌گرداند
    const instant = await instantPromise;
    if (instant) {
      return instant;
    }
    throw new Error('پاسخی از سرور دریافت نشد؛ اتصال اینترنت را بررسی کن.');
  }
}
