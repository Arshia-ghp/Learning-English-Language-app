import { CategoryId } from '../types';
import { CATEGORY_MAP } from '../config/categories';

export interface AiEnrichmentResult {
  english: string;
  persian: string;
  meta: string;
  example: string;
  notes: string;
}

export async function enrichWithGemini(params: {
  apiKey: string;
  category: CategoryId;
  english: string;
  persian: string;
}): Promise<AiEnrichmentResult> {
  const key = params.apiKey.trim() || (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  if (!key) {
    throw new Error(
      'کلید Gemini API تنظیم نشده است. از تب «تنظیمات» کلید رایگان Google AI Studio خود را وارد کن.'
    );
  }

  if (!navigator.onLine) {
    throw new Error('برای تکمیل هوشمند با هوش مصنوعی، اتصال اینترنت لازم است.');
  }

  const cat = CATEGORY_MAP[params.category];
  const hasEnglish = params.english.trim().length > 0;
  const hasPersian = params.persian.trim().length > 0;

  if (!hasEnglish && !hasPersian) {
    throw new Error('ابتدا متن انگلیسی (یا فارسی) را بنویس، سپس دکمه تکمیل هوشمند را بزن.');
  }

  const prompt = [
    `You are an elite English-Persian language tutor helping a student build a structured notebook.`,
    `Category: "${cat.enLabel}" (Meta field purpose: "${cat.metaLabel}").`,
    hasEnglish
      ? `Input English: "${params.english.trim()}"`
      : `Input Persian (provide the most natural, accurate English equivalent for this category): "${params.persian.trim()}"`,
    hasEnglish && hasPersian
      ? `User's partial Persian note: "${params.persian.trim()}"`
      : '',
    `Return ONLY valid JSON with these exact string keys:`,
    `- "english": clean, properly cased English word/phrase/grammar title/sentence`,
    `- "persian": concise, natural, accurate Persian meaning(s) or explanation`,
    `- "meta": specific value for "${cat.metaLabel}" (e.g., part of speech + IPA like "(v) /əˈtʃiːv/", or grammar formula, or Separable/Inseparable, or register/tone)`,
    `- "example": ONE natural, everyday English example sentence clearly using the target expression`,
    `- "notes": concise, high-value Persian study note (collocations, synonyms, or common mistakes by Persian learners; max 2 short lines)`
  ]
    .filter(Boolean)
    .join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    let errDetail = `کد خطا ${response.status}`;
    try {
      const errJson = (await response.json()) as { error?: { message?: string } };
      if (errJson.error?.message) errDetail = errJson.error.message;
    } catch {
      // ignore
    }
    throw new Error(`خطا در ارتباط با Gemini API: ${errDetail}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };

  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) {
    throw new Error('پاسخی از هوش مصنوعی دریافت نشد.');
  }

  const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleaned) as Partial<AiEnrichmentResult>;

  return {
    english: String(parsed.english || params.english || '').trim(),
    persian: String(parsed.persian || params.persian || '').trim(),
    meta: String(parsed.meta || '').trim(),
    example: String(parsed.example || '').trim(),
    notes: String(parsed.notes || '').trim()
  };
}
