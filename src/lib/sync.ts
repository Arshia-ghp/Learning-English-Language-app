import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { db, persistEmergencyMirror } from '../db/database';
import { getCategorySafe } from '../config/categories';
import { FsrsState, NotebookEntry, Rating, ReviewLog } from '../types';

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

const SUPABASE_TIMEOUT_MS = 10000;

/**
 * لایه fetch با تایم‌اوت سخت‌گیرانه ۱۰ ثانیه‌ای:
 * جلوگیری قطعی از گیر کردن همیشگی روی «در حال همگام‌سازی» هنگام نبود فیلترشکن یا اختلال شبکه.
 */
async function timedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SUPABASE_TIMEOUT_MS);

  const externalSignal = init?.signal;
  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(
        'اتصال به سرور Supabase برقرار نشد (تایم‌اوت ۱۰ ثانیه). اگر بدون فیلترشکن هستی، از همگام‌سازی مستقیم با گوگل شیت استفاده کن.'
      );
    }
    throw err;
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export function resolveSupabaseConfig(
  settingsUrl?: string,
  settingsKey?: string
): { url: string; anonKey: string } {
  const url = (settingsUrl || import.meta.env.VITE_SUPABASE_URL || '').trim();
  const anonKey = (settingsKey || import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();
  return { url, anonKey };
}

export function getSupabaseClient(
  settingsUrl?: string,
  settingsKey?: string
): SupabaseClient | null {
  const { url, anonKey } = resolveSupabaseConfig(settingsUrl, settingsKey);
  if (!url || !anonKey) return null;

  const signature = `${url}|${anonKey}`;
  if (cachedClient && cachedKey === signature) {
    return cachedClient;
  }

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    },
    global: {
      fetch: timedFetch
    }
  });
  cachedKey = signature;
  return cachedClient;
}

/**
 * خواندن نشست کاربر از حافظه محلی (بدون درخواست شبکه — ۰ میلی‌ثانیه و بدون نیاز به فیلترشکن)
 */
export async function getCloudUser(
  settingsUrl?: string,
  settingsKey?: string
): Promise<User | null> {
  const client = getSupabaseClient(settingsUrl, settingsKey);
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data.session?.user ?? null;
  } catch {
    return null;
  }
}

export async function cloudSignIn(
  email: string,
  password: string,
  settingsUrl?: string,
  settingsKey?: string
): Promise<User> {
  const client = getSupabaseClient(settingsUrl, settingsKey);
  if (!client) throw new Error('آدرس و کلید Supabase تنظیم نشده است.');

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(error?.message || 'ورود به حساب ابری ناموفق بود.');
  }
  return data.user;
}

export async function cloudSignUp(
  email: string,
  password: string,
  settingsUrl?: string,
  settingsKey?: string
): Promise<{ user: User | null; needsConfirmation: boolean }> {
  const client = getSupabaseClient(settingsUrl, settingsKey);
  if (!client) throw new Error('آدرس و کلید Supabase تنظیم نشده است.');

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    throw new Error(error.message);
  }
  return {
    user: data.user ?? null,
    needsConfirmation: !data.session
  };
}

export async function cloudSignOut(
  settingsUrl?: string,
  settingsKey?: string
): Promise<void> {
  const client = getSupabaseClient(settingsUrl, settingsKey);
  if (!client) return;
  // خروج محلی آنی تا در نبود فیلترشکن یا اینترنت هرگز هنگ نکند
  await client.auth.signOut({ scope: 'local' });
}

interface RemoteEntryRow {
  user_id: string;
  id: string;
  category: string;
  session: string;
  english: string;
  persian: string;
  meta: string;
  example: string;
  notes: string;
  tags: string[];
  favorite: boolean;
  state: number;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  elapsed_days: number;
  scheduled_days: number;
  last_review: string | null;
  due: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

interface RemoteLogRow {
  user_id: string;
  id: string;
  entry_id: string;
  rating: number;
  reviewed_at: string;
  day_key: string;
}

export interface SyncReport {
  pushed: number;
  pulled: number;
  syncedAt: string;
}

export async function syncWithSupabase(params: {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}): Promise<SyncReport> {
  if (!navigator.onLine) {
    throw new Error('اتصال اینترنت برقرار نیست. تغییرات به‌صورت آفلاین امن هستند.');
  }

  const client = getSupabaseClient(params.supabaseUrl, params.supabaseAnonKey);
  if (!client) {
    throw new Error('تنظیمات Supabase وارد نشده است.');
  }

  const { data: sessionData, error: authErr } = await client.auth.getSession();
  const user = sessionData.session?.user;
  if (authErr || !user) {
    throw new Error('ابتدا در بخش تنظیمات وارد حساب ابری خود شوید.');
  }

  const userId = user.id;
  let pushed = 0;
  let pulled = 0;

  // 1) PUSH
  const pendingEntries = await db.entries
    .where('syncStatus')
    .equals('pending')
    .toArray();

  if (pendingEntries.length > 0) {
    const rows: RemoteEntryRow[] = pendingEntries.map((e) => ({
      user_id: userId,
      id: e.id,
      category: e.category,
      session: e.session,
      english: e.english,
      persian: e.persian,
      meta: e.meta,
      example: e.example,
      notes: e.notes,
      tags: e.tags || [],
      favorite: Boolean(e.favorite),
      state: e.state,
      stability: e.stability,
      difficulty: e.difficulty,
      reps: e.reps,
      lapses: e.lapses,
      elapsed_days: e.elapsedDays,
      scheduled_days: e.scheduledDays,
      last_review: e.lastReview,
      due: e.due,
      created_at: e.createdAt,
      updated_at: e.updatedAt,
      deleted_at: e.deletedAt
    }));

    const { error: upsertErr } = await client
      .from('notebook_entries')
      .upsert(rows, { onConflict: 'user_id,id' });

    if (upsertErr) {
      throw new Error('خطا در ارسال یادداشت‌ها به سرور: ' + upsertErr.message);
    }

    await db.transaction('rw', db.entries, async () => {
      for (const item of pendingEntries) {
        await db.entries.update(item.id, { syncStatus: 'synced' });
      }
    });
    pushed += pendingEntries.length;
  }

  const pendingLogs = await db.reviewLogs
    .where('syncStatus')
    .equals('pending')
    .toArray();

  if (pendingLogs.length > 0) {
    const logRows: RemoteLogRow[] = pendingLogs.map((l) => ({
      user_id: userId,
      id: l.id,
      entry_id: l.entryId,
      rating: l.rating,
      reviewed_at: l.reviewedAt,
      day_key: l.dayKey
    }));

    const { error: logErr } = await client
      .from('notebook_review_logs')
      .upsert(logRows, { onConflict: 'user_id,id' });

    if (!logErr) {
      await db.transaction('rw', db.reviewLogs, async () => {
        for (const l of pendingLogs) {
          await db.reviewLogs.update(l.id, { syncStatus: 'synced' });
        }
      });
    }
  }

  // 2) FULL PULL (بدون فیلتر lastSyncedAt تا هیچ یادداشت آفلاینی جا نماند)
  const { data: remoteEntries, error: pullErr } = await client
    .from('notebook_entries')
    .select('*')
    .eq('user_id', userId);

  if (pullErr) {
    throw new Error('خطا در دریافت یادداشت‌ها از سرور: ' + pullErr.message);
  }

  if (remoteEntries && remoteEntries.length > 0) {
    const typedRemote = remoteEntries as RemoteEntryRow[];
    await db.transaction('rw', db.entries, async () => {
      for (const r of typedRemote) {
        const local = await db.entries.get(r.id);
        const remoteUpdated = new Date(r.updated_at).getTime();
        const localUpdated = local ? new Date(local.updatedAt).getTime() : 0;

        if (!local || (Number.isFinite(remoteUpdated) && remoteUpdated > (Number.isFinite(localUpdated) ? localUpdated : 0))) {
          const cat = getCategorySafe(r.category);
          const merged: NotebookEntry = {
            id: r.id,
            category: cat.id,
            session: r.session || '',
            english: r.english || '',
            persian: r.persian || '',
            meta: r.meta || '',
            example: r.example || '',
            notes: r.notes || '',
            tags: Array.isArray(r.tags) ? r.tags : [],
            favorite: Boolean(r.favorite),
            state: ([0, 1, 2, 3].includes(Number(r.state)) ? Number(r.state) : 0) as FsrsState,
            stability: Number.isFinite(Number(r.stability)) ? Number(r.stability) : 0,
            difficulty: Number.isFinite(Number(r.difficulty)) ? Number(r.difficulty) : 0,
            reps: Number.isFinite(Number(r.reps)) ? Number(r.reps) : 0,
            lapses: Number.isFinite(Number(r.lapses)) ? Number(r.lapses) : 0,
            elapsedDays: Number.isFinite(Number(r.elapsed_days)) ? Number(r.elapsed_days) : 0,
            scheduledDays: Number.isFinite(Number(r.scheduled_days)) ? Number(r.scheduled_days) : 0,
            lastReview: r.last_review,
            due: r.due || new Date().toISOString(),
            createdAt: r.created_at || new Date().toISOString(),
            updatedAt: r.updated_at || new Date().toISOString(),
            deletedAt: r.deleted_at || null,
            syncStatus: 'synced'
          };
          await db.entries.put(merged);
          pulled += 1;
        }
      }
    });
  }

  const { data: remoteLogs } = await client
    .from('notebook_review_logs')
    .select('*')
    .eq('user_id', userId);

  if (remoteLogs && remoteLogs.length > 0) {
    const typedLogs = remoteLogs as RemoteLogRow[];
    await db.transaction('rw', db.reviewLogs, async () => {
      for (const rl of typedLogs) {
        const exists = await db.reviewLogs.get(rl.id);
        if (!exists) {
          const localLog: ReviewLog = {
            id: rl.id,
            entryId: rl.entry_id,
            rating: ([1, 2, 3, 4].includes(Number(rl.rating)) ? Number(rl.rating) : 3) as Rating,
            reviewedAt: rl.reviewed_at,
            dayKey: rl.day_key,
            syncStatus: 'synced'
          };
          await db.reviewLogs.put(localLog);
        }
      }
    });
  }

  await persistEmergencyMirror();

  return {
    pushed,
    pulled,
    syncedAt: new Date().toISOString()
  };
}
