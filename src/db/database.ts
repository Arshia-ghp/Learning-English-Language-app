import Dexie, { type Table } from 'dexie';
import { CategoryId, NotebookEntry, Rating, ReviewLog } from '../types';
import { getLocalDayKey } from '../lib/jalali';
import { scheduleCard } from '../lib/fsrs';

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
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function normalizeSearch(text: string): string {
  return text
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
        tags: input.tags ?? existing.tags,
        favorite: input.favorite ?? existing.favorite,
        updatedAt: nowIso,
        deletedAt: null,
        syncStatus: 'pending'
      };
      await db.entries.put(updated);
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

    // New FSRS card (due immediately for first review or tomorrow if user prefers)
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
}

export async function softDeleteEntry(id: string): Promise<void> {
  const nowIso = new Date().toISOString();
  await db.entries.update(id, {
    deletedAt: nowIso,
    updatedAt: nowIso,
    syncStatus: 'pending'
  });
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
    ...nextFsrs,
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

  return updated;
}

export async function findDuplicateEntries(
  englishText: string,
  excludeId?: string
): Promise<NotebookEntry[]> {
  const norm = normalizeEnglish(englishText);
  if (norm.length < 2) return [];

  const all = await db.entries.filter((e) => e.deletedAt === null).toArray();
  return all
    .filter((e) => e.id !== excludeId && normalizeEnglish(e.english) === norm)
    .slice(0, 3);
}
