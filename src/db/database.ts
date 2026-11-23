import Dexie, { type Table } from 'dexie';
import { CategoryId, NotebookEntry, Rating, ReviewLog } from '../types';
import { getLocalDayKey } from '../lib/jalali';
import { scheduleCard } from '../lib/fsrs';

const MIRROR_ENTRIES_KEY = 'lexiflow_mirror_entries_v2';

class LexiFlowDB extends Dexie {
  entries!: Table<NotebookEntry, string>;
  reviewLogs!: Table<ReviewLog, string>;

  constructor() {
    super('LexiFlowNotebookDB');
    this.version(1).stores({
      entries: 'id, category, session, due, createdAt, updatedAt, deletedAt, syncStatus, favorite',
      reviewLogs: 'id, entryId, dayKey, reviewedAt, syncStatus'
    });
  }
}

export const db = new LexiFlowDB();

/**
 * لایه محافظتی اضطراری روی localStorage:
 * اگر مرورگر موبایل زمانی کش IndexedDB را خالی کرد، داده‌ها خودکار از این آینه بازیابی می‌شوند.
 */
export async function persistEmergencyMirror(): Promise<void> {
  try {
    const all = await db.entries.toArray();
    if (all.length > 0 && all.length <= 2500) {
      localStorage.setItem(MIRROR_ENTRIES_KEY, JSON.stringify(all));
    }
  } catch {
    // نادیده گرفتن محدودیت ظرفیت localStorage
  }
}

export async function healDatabaseFromMirrorIfEmpty(): Promise<number> {
  try {
    const count = await db.entries.count();
    if (count > 0) return 0;
    const raw = localStorage.getItem(MIRROR_ENTRIES_KEY);
    if (!raw) return 0;
    const parsed = JSON.parse(raw) as NotebookEntry[];
    if (!Array.isArray(parsed) || parsed.length === 0) return 0;
    await db.entries.bulkPut(parsed);
    return parsed.length;
  } catch {
    return 0;
  }
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return (
    Date.now().toString(36) +
    '-' +
    Math.random().toString(36).slice(2, 10) +
    '-' +
    Math.random().toString(36).slice(2, 6)
  );
}

export function normalizeEnglish(text: string): string {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeSearch(text: string): string {
  return String(text || '')
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export interface SaveEntryInput {
  id?: string;
  category: CategoryId;
  session: string;
  english: string;
  persian: string;
  meta: string;
  example: string;
  notes: string;
  tags?: string[];
  favorite?: boolean;
}

export async function saveLocalEntry(input: SaveEntryInput): Promise<NotebookEntry> {
  const nowIso = new Date().toISOString();

  if (input.id) {
    const existing = await db.entries.get(input.id);
    if (existing) {
      const updated: NotebookEntry = {
        ...existing,
        category: input.category,
        session: input.session.trim(),
        english: input.english.trim(),
        persian: input.persian.trim(),
        meta: input.meta.trim(),
        example: input.example.trim(),
        notes: input.notes.trim(),
        tags: input.tags ?? existing.tags ?? [],
        favorite: input.favorite ?? Boolean(existing.favorite),
        updatedAt: nowIso,
        deletedAt: null,
        syncStatus: 'pending'
      };
      await db.entries.put(updated);
      void persistEmergencyMirror();
      return updated;
    }
  }

  const created: NotebookEntry = {
    id: generateId(),
    category: input.category,
    session: input.session.trim(),
    english: input.english.trim(),
    persian: input.persian.trim(),
    meta: input.meta.trim(),
    example: input.example.trim(),
    notes: input.notes.trim(),
    tags: input.tags ?? [],
    favorite: Boolean(input.favorite),

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

  await db.entries.put(created);
  void persistEmergencyMirror();
  return created;
}

export async function toggleFavoriteEntry(id: string): Promise<void> {
  const item = await db.entries.get(id);
  if (!item || item.deletedAt) return;
  await db.entries.update(id, {
    favorite: !item.favorite,
    updatedAt: new Date().toISOString(),
    syncStatus: 'pending'
  });
  void persistEmergencyMirror();
}

export async function softDeleteEntry(id: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.entries.update(id, {
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncStatus: 'pending'
  });
  void persistEmergencyMirror();
}

export async function submitCardReview(
  entryId: string,
  rating: Rating
): Promise<NotebookEntry | null> {
  const entry = await db.entries.get(entryId);
  if (!entry || entry.deletedAt) return null;

  const now = new Date();
  const nextFsrs = scheduleCard(entry, rating, now);

  const updated: NotebookEntry = {
    ...entry,
    state: nextFsrs.state,
    stability: nextFsrs.stability,
    difficulty: nextFsrs.difficulty,
    reps: nextFsrs.reps,
    lapses: nextFsrs.lapses,
    elapsedDays: nextFsrs.elapsedDays,
    scheduledDays: nextFsrs.scheduledDays,
    lastReview: nextFsrs.lastReview,
    due: nextFsrs.due,
    updatedAt: now.toISOString(),
    syncStatus: 'pending'
  };

  const log: ReviewLog = {
    id: generateId(),
    entryId: entry.id,
    rating,
    reviewedAt: now.toISOString(),
    dayKey: getLocalDayKey(now),
    syncStatus: 'pending'
  };

  await db.transaction('rw', db.entries, db.reviewLogs, async () => {
    await db.entries.put(updated);
    await db.reviewLogs.put(log);
  });

  void persistEmergencyMirror();
  return updated;
}

export async function findDuplicateEntries(
  englishText: string,
  excludeId?: string
): Promise<NotebookEntry[]> {
  const norm = normalizeEnglish(englishText);
  if (norm.length < 2) return [];

  const all = await db.entries.filter((e) => !e.deletedAt).toArray();
  return all
    .filter((e) => e.id !== excludeId && normalizeEnglish(e.english) === norm)
    .slice(0, 3);
}
