import { db, generateId } from '../db/database';
import { getCategorySafe } from '../config/categories';
import { CategoryId, NotebookEntry, ReviewLog } from '../types';

function triggerDownload(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function escapeCsvCell(val: string): string {
  const s = String(val ?? '');
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

export async function exportJsonBackup(): Promise<number> {
  const entries = await db.entries.filter((e) => !e.deletedAt).toArray();
  const reviewLogs = await db.reviewLogs.toArray();

  const payload = {
    app: 'LexiFlow-PWA',
    version: 1,
    exportedAt: new Date().toISOString(),
    entries,
    reviewLogs
  };

  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(
    `lexiflow-backup-${stamp}.json`,
    JSON.stringify(payload, null, 2),
    'application/json;charset=utf-8'
  );
  return entries.length;
}

export async function importJsonBackup(file: File): Promise<{ added: number; updated: number }> {
  const text = await file.text();
  const parsed = JSON.parse(text) as {
    entries?: NotebookEntry[];
    reviewLogs?: ReviewLog[];
  };

  if (!Array.isArray(parsed.entries)) {
    throw new Error('فرمت فایل بکاپ معتبر نیست.');
  }

  let added = 0;
  let updated = 0;

  await db.transaction('rw', db.entries, db.reviewLogs, async () => {
    for (const raw of parsed.entries || []) {
      if (!raw.english || !raw.persian) continue;
      const id = raw.id || generateId();
      const existing = await db.entries.get(id);

      const cleanEntry: NotebookEntry = {
        id,
        category: getCategorySafe(raw.category).id,
        session: raw.session || '',
        english: String(raw.english).trim(),
        persian: String(raw.persian).trim(),
        meta: raw.meta || '',
        example: raw.example || '',
        notes: raw.notes || '',
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        favorite: Boolean(raw.favorite),
        state: raw.state ?? 0,
        stability: Number(raw.stability) || 0,
        difficulty: Number(raw.difficulty) || 0,
        reps: Number(raw.reps) || 0,
        lapses: Number(raw.lapses) || 0,
        elapsedDays: Number(raw.elapsedDays) || 0,
        scheduledDays: Number(raw.scheduledDays) || 0,
        lastReview: raw.lastReview ?? null,
        due: raw.due || new Date().toISOString(),
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || new Date().toISOString(),
        deletedAt: null,
        syncStatus: 'pending'
      };

      if (!existing) {
        await db.entries.put(cleanEntry);
        added++;
      } else if (new Date(cleanEntry.updatedAt) > new Date(existing.updatedAt)) {
        await db.entries.put(cleanEntry);
        updated++;
      }
    }

    for (const log of parsed.reviewLogs || []) {
      if (!log.id || !log.entryId) continue;
      const exists = await db.reviewLogs.get(log.id);
      if (!exists) {
        await db.reviewLogs.put({ ...log, syncStatus: 'pending' });
      }
    }
  });

  return { added, updated };
}

/**
 * خروجی استاندارد CSV سازگار با اپلیکیشن Anki و اکسل (با UTF-8 BOM برای نمایش صحیح فارسی)
 */
export async function exportAnkiCsv(categoryFilter: CategoryId | 'all' = 'all'): Promise<number> {
  const all = await db.entries.filter((e) => !e.deletedAt).toArray();
  const filtered =
    categoryFilter === 'all' ? all : all.filter((e) => e.category === categoryFilter);

  const header = ['Front', 'Back', 'Meta', 'Example', 'Notes', 'Tags'];
  const rows = filtered.map((e) => {
    const cat = getCategorySafe(e.category);
    const backHtml = [
      `<b>${e.persian}</b>`,
      e.meta ? `<br><small>${e.meta}</small>` : '',
      e.example ? `<br><i>${e.example}</i>` : '',
      e.notes ? `<br>${e.notes}` : ''
    ].join('');
    const tagStr = [cat.enLabel.replace(/\s+/g, '_'), e.session.replace(/\s+/g, '_')]
      .filter(Boolean)
      .join(' ');
    return [
      escapeCsvCell(e.english),
      escapeCsvCell(backHtml),
      escapeCsvCell(e.meta),
      escapeCsvCell(e.example),
      escapeCsvCell(e.notes),
      escapeCsvCell(tagStr)
    ].join(',');
  });

  const csvContent = '\uFEFF' + [header.join(','), ...rows].join('\r\n');
  const stamp = new Date().toISOString().slice(0, 10);
  triggerDownload(`lexiflow-anki-${stamp}.csv`, csvContent, 'text/csv;charset=utf-8');
  return filtered.length;
}

/**
 * ایمپورت مستقیم فایل CSV خروجی‌گرفته‌شده از گوگل شیت قبلی (دفترچه زبان)
 */
export async function importGoogleSheetCsv(
  file: File,
  targetCategory: CategoryId
): Promise<number> {
  const text = await file.text();
  const lines = parseCsvLines(text);
  if (lines.length < 2) {
    throw new Error('فایل CSV خالی است یا سطر داده ندارد.');
  }

  const header = lines[0].map((h) => h.trim());
  const idxEn = header.findIndex((h) => h.includes('انگلیسی') || h.toLowerCase() === 'english');
  const idxFa = header.findIndex((h) => h.includes('فارسی') || h.toLowerCase() === 'persian');
  const idxSession = header.findIndex((h) => h.includes('جلسه') || h.toLowerCase() === 'session');
  const idxExample = header.findIndex((h) => h.includes('مثال') || h.toLowerCase() === 'example');
  const idxNotes = header.findIndex((h) => h.includes('توضیحات') || h.toLowerCase() === 'notes');
  // ستون ششم در شیت قبلی فیلد متا بود
  const idxMeta = 5;

  if (idxEn === -1 || idxFa === -1) {
    throw new Error('ستون‌های «متن انگلیسی» و «معنی فارسی» در فایل CSV پیدا نشد.');
  }

  const nowIso = new Date().toISOString();
  let imported = 0;

  await db.transaction('rw', db.entries, async () => {
    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      const english = (row[idxEn] || '').trim();
      const persian = (row[idxFa] || '').trim();
      if (!english || !persian) continue;

      const entry: NotebookEntry = {
        id: generateId(),
        category: targetCategory,
        session: idxSession >= 0 ? (row[idxSession] || '').trim() : '',
        english,
        persian,
        meta: idxMeta < row.length && idxMeta !== idxEn && idxMeta !== idxFa ? (row[idxMeta] || '').trim() : '',
        example: idxExample >= 0 ? (row[idxExample] || '').trim() : '',
        notes: idxNotes >= 0 ? (row[idxNotes] || '').trim() : '',
        tags: [],
        favorite: false,
        state: 0,
        stability: 0,
        difficulty: 0,
        reps: 0,
        lapses: 0,
        elapsedDays: 0,
        scheduledDays: 0,
        lastReview: null,
        due: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
        deletedAt: null,
        syncStatus: 'pending'
      };
      await db.entries.put(entry);
      imported++;
    }
  });

  return imported;
}

function parseCsvLines(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  const clean = text.replace(/^\uFEFF/, '');

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    const next = clean[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && next === '\n') i++;
      row.push(cell);
      if (row.some((c) => c.trim().length > 0)) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((c) => c.trim().length > 0)) rows.push(row);
  return rows;
}
