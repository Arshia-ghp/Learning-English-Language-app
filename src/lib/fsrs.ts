import { FsrsState, NotebookEntry, Rating } from '../types';
import { toFaDigits } from './jalali';

/**
 * پیاده‌سازی استاندارد و بدون وابستگی الگوریتم FSRS-5
 * (Free Spaced Repetition Scheduler — 19 parameters, 90% target retention)
 */

const W = [
  0.40255, 1.18385, 3.173, 15.69105,
  7.1949, 0.5345, 1.4604, 0.0046,
  1.54575, 0.1192, 1.01925, 1.9395,
  0.11, 0.29605, 2.2698, 0.2315,
  2.9898, 0.51655, 0.6621
];

const DECAY = -0.5;
const FACTOR = 19 / 81;
const REQUEST_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 3650;

function clamp(val: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, val));
}

function initStability(rating: Rating): number {
  return Math.max(0.1, W[rating - 1]);
}

function initDifficulty(rating: Rating): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

function nextDifficulty(d: number, rating: Rating): number {
  const deltaD = -W[6] * (rating - 3);
  const damped = d + (deltaD * (10 - d)) / 9;
  const meanReverted = W[7] * initDifficulty(4) + (1 - W[7]) * damped;
  return clamp(meanReverted, 1, 10);
}

function forgettingCurve(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

function nextIntervalDays(stability: number): number {
  const raw = (stability / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

function nextRecallStability(
  d: number,
  s: number,
  r: number,
  rating: Rating
): number {
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const growth =
    Math.exp(W[8]) *
    (11 - d) *
    Math.pow(Math.max(0.1, s), -W[9]) *
    (Math.exp(W[10] * (1 - r)) - 1) *
    hardPenalty *
    easyBonus;
  return Math.max(0.1, s * (1 + growth));
}

function nextShortTermStability(s: number, rating: Rating): number {
  return Math.max(0.1, s * Math.exp(W[17] * (rating - 3 + W[18])));
}

function nextForgetStability(d: number, s: number, r: number): number {
  const sNew =
    W[11] *
    Math.pow(d, -W[12]) *
    (Math.pow(Math.max(0.1, s) + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - r));
  return clamp(sNew, 0.1, Math.max(0.1, s));
}

export interface FsrsScheduleResult {
  state: FsrsState;
  stability: number;
  difficulty: number;
  reps: number;
  lapses: number;
  elapsedDays: number;
  scheduledDays: number;
  lastReview: string;
  due: string;
  intervalMinutes: number;
}

export function scheduleCard(
  card: Pick<
    NotebookEntry,
    'state' | 'stability' | 'difficulty' | 'reps' | 'lapses' | 'lastReview'
  >,
  rating: Rating,
  now: Date = new Date()
): FsrsScheduleResult {
  const nowMs = now.getTime();
  const elapsedDays = card.lastReview
    ? Math.max(0, (nowMs - new Date(card.lastReview).getTime()) / 86400000)
    : 0;

  let newState: FsrsState = card.state;
  let newStability = card.stability;
  let newDifficulty = card.difficulty;
  let newLapses = card.lapses;
  const newReps = card.reps + 1;

  let intervalMinutes = 1440; // default 1 day
  let scheduledDays = 1;

  if (card.state === 0) {
    // کارت جدید
    newStability = initStability(rating);
    newDifficulty = initDifficulty(rating);

    if (rating === 1) {
      newState = 1; // Learning
      intervalMinutes = 5; // 5 دقیقه بعد (در همین جلسه تکرار می‌شود)
      scheduledDays = 0;
    } else if (rating === 2) {
      newState = 2; // Review
      scheduledDays = 1;
      intervalMinutes = 1440;
    } else if (rating === 3) {
      newState = 2;
      scheduledDays = Math.max(1, nextIntervalDays(newStability));
      intervalMinutes = scheduledDays * 1440;
    } else {
      newState = 2;
      scheduledDays = Math.max(4, nextIntervalDays(newStability));
      intervalMinutes = scheduledDays * 1440;
    }
  } else if (card.state === 1 || card.state === 3) {
    // در حال یادگیری یا بازآموزی
    newStability = nextShortTermStability(Math.max(0.2, card.stability), rating);
    newDifficulty = nextDifficulty(card.difficulty || 5, rating);

    if (rating === 1) {
      newState = card.state;
      intervalMinutes = 5;
      scheduledDays = 0;
    } else if (rating === 2) {
      newState = card.state;
      intervalMinutes = 15;
      scheduledDays = 0;
    } else if (rating === 3) {
      newState = 2;
      scheduledDays = Math.max(1, nextIntervalDays(newStability));
      intervalMinutes = scheduledDays * 1440;
    } else {
      newState = 2;
      scheduledDays = Math.max(3, nextIntervalDays(newStability));
      intervalMinutes = scheduledDays * 1440;
    }
  } else {
    // حالت مرور (Review)
    const r = forgettingCurve(elapsedDays, Math.max(0.1, card.stability));
    newDifficulty = nextDifficulty(card.difficulty || 5, rating);

    if (rating === 1) {
      newLapses += 1;
      newState = 3; // Relearning
      newStability = nextForgetStability(newDifficulty, card.stability, r);
      intervalMinutes = 5;
      scheduledDays = 0;
    } else {
      newState = 2;
      if (elapsedDays < 1) {
        newStability = nextShortTermStability(card.stability, rating);
      } else {
        newStability = nextRecallStability(newDifficulty, card.stability, r, rating);
      }

      const hardInterval = Math.max(1, nextIntervalDays(newStability));
      if (rating === 2) {
        scheduledDays = Math.max(1, Math.min(hardInterval, Math.round(card.stability * 1.2) || 1));
      } else if (rating === 3) {
        scheduledDays = Math.max(1, nextIntervalDays(newStability));
      } else {
        scheduledDays = Math.max(nextIntervalDays(newStability), Math.round(card.stability * 1.3) + 1);
      }
      intervalMinutes = scheduledDays * 1440;
    }
  }

  const dueDate = new Date(nowMs + intervalMinutes * 60000);

  return {
    state: newState,
    stability: Number(newStability.toFixed(4)),
    difficulty: Number(newDifficulty.toFixed(4)),
    reps: newReps,
    lapses: newLapses,
    elapsedDays: Number(elapsedDays.toFixed(4)),
    scheduledDays,
    lastReview: now.toISOString(),
    due: dueDate.toISOString(),
    intervalMinutes
  };
}

export function formatIntervalFa(minutes: number): string {
  if (minutes < 60) {
    return `${toFaDigits(Math.max(1, Math.round(minutes)))} دقیقه`;
  }
  const hours = minutes / 60;
  if (hours < 24) {
    return `${toFaDigits(Math.round(hours))} ساعت`;
  }
  const days = Math.round(minutes / 1440);
  if (days < 30) {
    return `${toFaDigits(days)} روز`;
  }
  if (days < 365) {
    const months = Math.round((days / 30) * 10) / 10;
    return `${toFaDigits(months)} ماه`;
  }
  const years = Math.round((days / 365) * 10) / 10;
  return `${toFaDigits(years)} سال`;
}

export function previewCardRatings(
  card: NotebookEntry,
  now: Date = new Date()
): Record<Rating, string> {
  return {
    1: formatIntervalFa(scheduleCard(card, 1, now).intervalMinutes),
    2: formatIntervalFa(scheduleCard(card, 2, now).intervalMinutes),
    3: formatIntervalFa(scheduleCard(card, 3, now).intervalMinutes),
    4: formatIntervalFa(scheduleCard(card, 4, now).intervalMinutes)
  };
}

export function isEntryMastered(entry: NotebookEntry): boolean {
  return entry.state === 2 && entry.stability >= 21;
}

export function isEntryDue(entry: NotebookEntry, nowMs: number = Date.now()): boolean {
  return new Date(entry.due).getTime() <= nowMs;
}

export function getMasteryBadge(entry: NotebookEntry): {
  label: string;
  tone: 'new' | 'learning' | 'review' | 'mastered';
} {
  if (entry.state === 0) return { label: 'تازه', tone: 'new' };
  if (isEntryMastered(entry)) return { label: 'تسلط کامل ✓', tone: 'mastered' };
  if (entry.state === 1 || entry.state === 3) {
    return { label: 'در حال تثبیت', tone: 'learning' };
  }
  return {
    label: `پایداری ${toFaDigits(Math.max(1, Math.round(entry.stability)))} روز`,
    tone: 'review'
  };
}
