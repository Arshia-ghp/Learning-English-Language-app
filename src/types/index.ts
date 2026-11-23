export type CategoryId =
  | 'word'
  | 'phrase'
  | 'grammar'
  | 'sentence'
  | 'phrasal'
  | 'speaking';

export type FsrsState = 0 | 1 | 2 | 3; // 0: New, 1: Learning, 2: Review, 3: Relearning
export type Rating = 1 | 2 | 3 | 4; // 1: Again, 2: Hard, 3: Good, 4: Easy
export type SyncStatus = 'pending' | 'synced';
export type SyncProvider = 'none' | 'sheets' | 'supabase';
export type Accent = 'en-US' | 'en-GB';
export type ThemeId = 'navy' | 'emerald' | 'royal' | 'crimson';
export type TabId = 'add' | 'library' | 'review' | 'stats' | 'settings';
export type ReviewStudyMode = 'standard' | 'cloze' | 'reverse';

export interface CategoryConfig {
  id: CategoryId;
  label: string;
  enLabel: string;
  shortLabel: string;
  metaLabel: string;
  metaPlaceholder: string;
  englishPlaceholder: string;
  persianPlaceholder: string;
  examplePlaceholder: string;
  color: string;
  softBg: string;
  darkSoftBg: string;
  badgeText: string;
}

export interface NotebookEntry {
  id: string;
  category: CategoryId;
  session: string;
  english: string;
  persian: string;
  meta: string;
  example: string;
  notes: string;
  tags: string[];
  favorite: boolean;

  // FSRS-5 fields
  state: FsrsState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: string | null;
  due: string;

  // Sync & Timestamps
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  syncStatus: SyncStatus;
}

export interface ReviewLog {
  id: string;
  entryId: string;
  rating: Rating;
  reviewedAt: string;
  dayKey: string; // YYYY-MM-DD (local time)
  syncStatus: SyncStatus;
}

export interface AppSettings {
  theme: ThemeId;
  darkMode: boolean;
  accent: Accent;
  keepSession: boolean;
  lastSession: string;
  syncProvider: SyncProvider;
  sheetsWebAppUrl: string;
  sheetsSecretPin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  geminiApiKey: string;
  lastSyncedAt: string | null;
}

export interface ToastMessage {
  id: number;
  type: 'ok' | 'err' | 'info';
  text: string;
}
