import { db, persistEmergencyMirror } from '../db/database';
import { getCategorySafe } from '../config/categories';
import { FsrsState, NotebookEntry, Rating, ReviewLog } from '../types';
import { SyncReport } from './sync';

interface SheetSyncResponse {
  ok: boolean;
  error?: string;
  entries?: Array<Partial<NotebookEntry>>;
  reviewLogs?: Array<Partial<ReviewLog>>;
  serverTime?: string;
}

function normalizeRemoteEntry(raw: Partial<NotebookEntry>): NotebookEntry | null {
  if (!raw || !raw.id || !raw.english) return null;
  const cat = getCategorySafe(raw.category);
  const nowIso = new Date().toISOString();

  return {
    id: String(raw.id),
    category: cat.id,
    session: String(raw.session || ''),
    english: String(raw.english || ''),
    persian: String(raw.persian || ''),
    meta: String(raw.meta || ''),
    example: String(raw.example || ''),
    notes: String(raw.notes || ''),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : [],
    favorite: Boolean(raw.favorite),
    state: ([0, 1, 2, 3].includes(Number(raw.state)) ? Number(raw.state) : 0) as FsrsState,
    stability: Number.isFinite(Number(raw.stability)) ? Number(raw.stability) : 0,
    difficulty: Number.isFinite(Number(raw.difficulty)) ? Number(raw.difficulty) : 0,
    reps: Number.isFinite(Number(raw.reps)) ? Number(raw.reps) : 0,
    lapses: Number.isFinite(Number(raw.lapses)) ? Number(raw.lapses) : 0,
    elapsedDays: Number.isFinite(Number(raw.elapsedDays)) ? Number(raw.elapsedDays) : 0,
    scheduledDays: Number.isFinite(Number(raw.scheduledDays)) ? Number(raw.scheduledDays) : 0,
    lastReview: raw.lastReview ? String(raw.lastReview) : null,
    due: raw.due ? String(raw.due) : nowIso,
    createdAt: raw.createdAt ? String(raw.createdAt) : nowIso,
    updatedAt: raw.updatedAt ? String(raw.updatedAt) : nowIso,
    deletedAt: raw.deletedAt ? String(raw.deletedAt) : null,
    syncStatus: 'synced'
  };
}

export async function syncWithGoogleSheets(params: {
  webAppUrl: string;
  secretPin: string;
}): Promise<SyncReport> {
  if (!navigator.onLine) {
    throw new Error('اینترنت وصل نیست. یادداشت‌ها روی دستگاه محفوظ هستند.');
  }

  const url = params.webAppUrl.trim();
  const pin = params.secretPin.trim();
  if (!url || !url.startsWith('https://script.google.com/')) {
    throw new Error('لینک Web App گوگل شیت معتبر نیست.');
  }
  if (!pin) {
    throw new Error('رمز همگام‌سازی گوگل شیت را وارد کن.');
  }

  // تمام موارد در انتظار ارسال (یا در اولین سینک، کل موارد محلی)
  const pendingEntries = await db.entries
    .where('syncStatus')
    .equals('pending')
    .toArray();
  const pendingLogs = await db.reviewLogs
    .where('syncStatus')
    .equals('pending')
    .toArray();

  // اگر کل پایگاه محلی خالی نباشد ولی هیچ pending نباشد، باز هم برای اطمینان sync انجام می‌شود
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 16000);

  let data: SheetSyncResponse;
  try {
    const res = await fetch(url, {
      method: 'POST',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({
        secret: pin,
        action: 'sync',
        entries: pendingEntries,
        reviewLogs: pendingLogs
      })
    });

    if (!res.ok) {
      throw new Error(`خطای سرور گوگل شیت (کد ${res.status})`);
    }

    const text = await res.text();
    try {
      data = JSON.parse(text) as SheetSyncResponse;
    } catch {
      throw new Error(
        'پاسخ گوگل شیت معتبر نبود. مطمئن شو در Deploy گزینه "Who has access" روی "Anyone" باشد.'
      );
    }
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('پاسخ گوگل شیت طول کشید (تایم‌اوت). دوباره تلاش کن.');
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
  }

  if (!data.ok) {
    throw new Error(data.error || 'همگام‌سازی با گوگل شیت ناموفق بود.');
  }

  // علامت‌گذاری موارد ارسال‌شده به‌عنوان synced
  if (pendingEntries.length > 0) {
    await db.transaction('rw', db.entries, async () => {
      for (const item of pendingEntries) {
        await db.entries.update(item.id, { syncStatus: 'synced' });
      }
    });
  }
  if (pendingLogs.length > 0) {
    await db.transaction('rw', db.reviewLogs, async () => {
      for (const l of pendingLogs) {
        await db.reviewLogs.update(l.id, { syncStatus: 'synced' });
      }
    });
  }

  // ادغام کامل موارد دریافتی از گوگل شیت (Last-Write-Wins)
  let pulled = 0;
  if (Array.isArray(data.entries) && data.entries.length > 0) {
    await db.transaction('rw', db.entries, async () => {
      for (const raw of data.entries || []) {
        const clean = normalizeRemoteEntry(raw);
        if (!clean) continue;

        const local = await db.entries.get(clean.id);
        const remoteMs = new Date(clean.updatedAt).getTime();
        const localMs = local ? new Date(local.updatedAt).getTime() : 0;

        if (!local || (Number.isFinite(remoteMs) && remoteMs > (Number.isFinite(localMs) ? localMs : 0))) {
          await db.entries.put(clean);
          pulled += 1;
        }
      }
    });
  }

  if (Array.isArray(data.reviewLogs) && data.reviewLogs.length > 0) {
    await db.transaction('rw', db.reviewLogs, async () => {
      for (const rl of data.reviewLogs || []) {
        if (!rl.id || !rl.entryId) continue;
        const exists = await db.reviewLogs.get(String(rl.id));
        if (!exists) {
          await db.reviewLogs.put({
            id: String(rl.id),
            entryId: String(rl.entryId),
            rating: ([1, 2, 3, 4].includes(Number(rl.rating)) ? Number(rl.rating) : 3) as Rating,
            reviewedAt: String(rl.reviewedAt || new Date().toISOString()),
            dayKey: String(rl.dayKey || ''),
            syncStatus: 'synced'
          });
        }
      }
    });
  }

  await persistEmergencyMirror();

  return {
    pushed: pendingEntries.length,
    pulled,
    syncedAt: data.serverTime || new Date().toISOString()
  };
}

/**
 * علامت‌گذاری کل داده‌های محلی به‌عنوان pending برای ارسال اولیه به گوگل شیت
 */
export async function markAllLocalPending(): Promise<number> {
  const all = await db.entries.toArray();
  const logs = await db.reviewLogs.toArray();
  await db.transaction('rw', db.entries, db.reviewLogs, async () => {
    for (const e of all) {
      await db.entries.update(e.id, { syncStatus: 'pending' });
    }
    for (const l of logs) {
      await db.reviewLogs.update(l.id, { syncStatus: 'pending' });
    }
  });
  return all.length;
}
