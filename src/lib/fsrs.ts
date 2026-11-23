import { FsrsState, NotebookEntry, Rating } from '../types';
import { toFaDigits } from './jalali';

/**
 * پیاده‌سازی استاندارد و مقاوم در برابر خطای الگوریتم FSRS-5
 * با محافظت کامل در برابر NaN و تاریخ‌های نامعتبر
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

function safeNum(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(val: number, min: number, max: number): number {
  const n = safeNum(val, min);
  return Math.min(max, Math.max(min, n));
}

function initStability(rating: Rating): number {
  return Math.max(0.1, W[rating - 1] ?? 0.4);
}

function initDifficulty(rating: Rating): number {
  return clamp(W[4] - Math.exp(W[5] * (rating - 1)) + 1, 1, 10);
}

function nextDifficulty(d: number, rating: Rating): number {
  const safeD = clamp(d, 1, 10);
  const deltaD = -W[6] * (rating - 3);
  const damped = safeD + (deltaD * (10 - safeD)) / 9;
  const meanReverted = W[7] * initDifficulty(4) + (1 - W[7]) * damped;
  return clamp(meanReverted, 1, 10);
}

function forgettingCurve(elapsedDays: number, stability: number): number {
  const s = Math.max(0.1, safeNum(stability, 0.1));
  const e = Math.max(0, safeNum(elapsedDays, 0));
  return clamp(Math.pow(1 + (FACTOR * e) / s, DECAY), 0, 1);
}

function nextIntervalDays(stability: number): number {
  const s = Math.max(0.1, safeNum(stability, 0.4));
  const raw = (s / FACTOR) * (Math.pow(REQUEST_RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

function nextRecallStability(
  d: number,
  s: number,
  r: number,
  rating: Rating
): number {
  const safeD = clamp(d, 1, 10);
  const safeS = Math.max(0.1, safeNum(s, 0.4));
  const safeR = clamp(r, 0, 1);
  const hardPenalty = rating === 2 ? W[15] : 1;
  const easyBonus = rating === 4 ? W[16] : 1;
  const growth =
    Math.exp(W[8]) *
    (11 - safeD) *
    Math.pow(safeS, -W[9]) *
    (Math.exp(W[10] * (1 - safeR)) - 1) *
    hardPenalty *
    easyBonus;
  return clamp(safeS * (1 + growth), 0.1, MAX_INTERVAL_DAYS);
}

function nextShortTermStability(s: number, rating: Rating): number {
  const safeS = Math.max(0.1, safeNum(s, 0.4));
  return clamp(safeS * Math.exp(W[17] * (rating - 3 + W[18])), 0.1, MAX_INTERVAL_DAYS);
}

function nextForgetStability(d: number, s: number, r: number): number {
  const safeD = clamp(d, 1, 10);
  const safeS = Math.max(0.1, safeNum(s, 0.4));
  const safeR = clamp(r, 0, 1);
  const sNew =
    W[11] *
    Math.pow(safeD, -W[12]) *
    (Math.pow(safeS + 1, W[13]) - 1) *
    Math.exp(W[14] * (1 - safeR));
  return clamp(sNew, 0.1, safeS);
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
  const nowMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  const safeNow = new Date(nowMs);

  let elapsedDays = 0;
  if (card.lastReview) {
    const lastMs = new Date(card.lastReview).getTime();
    if (Number.isFinite(lastMs)) {
      elapsedDays = Math.max(0, (nowMs - lastMs) / 86400000);
    }
  }

  const rawState = safeNum(card.state, 0);
  const currentState: FsrsState =
    rawState === 1 || rawState === 2 || rawState === 3 ? rawState : 0;
  const currentStability = Math.max(0, safeNum(card.stability, 0));
  const currentDifficulty = clamp(safeNum(card.difficulty, 5), 1, 10);
  let newState: FsrsState = currentState;
  let newStability = currentStability;
  let newDifficulty = currentDifficulty;
  let newLapses = Math.max(0, Math.floor(safeNum(card.lapses, 0)));
  const newReps = Math.max(0, Math.floor(safeNum(card.reps, 0))) + 1;

  let intervalMinutes = 1440;
  let scheduledDays = 1;

  if (currentState === 0) {
    newStability = initStability(rating);
    newDifficulty = initDifficulty(rating);

    if (rating === 1) {
      newState = 1;
      intervalMinutes = 5;
      scheduledDays = 0;
    } else if (rating === 2) {
      newState = 2;
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
  } else if (currentState === 1 || currentState === 3) {
    newStability = nextShortTermStability(Math.max(0.2, currentStability), rating);
    newDifficulty = nextDifficulty(currentDifficulty, rating);

    if (rating === 1) {
      newState = currentState;
      intervalMinutes = 5;
      scheduledDays = 0;
    } else if (rating === 2) {
      newState = currentState;
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
    const safeS = Math.max(0.1, currentStability);
    const r = forgettingCurve(elapsedDays, safeS);
    newDifficulty = nextDifficulty(currentDifficulty, rating);

    if (rating === 1) {
      newLapses += 1;
      newState = 3;
      newStability = nextForgetStability(newDifficulty, safeS, r);
      intervalMinutes = 5;
      scheduledDays = 0;
    } else {
      newState = 2;
      if (elapsedDays < 1) {
        newStability = nextShortTermStability(safeS, rating);
      } else {
        newStability = nextRecallStability(newDifficulty, safeS, r, rating);
      }

      const hardInterval = Math.max(1, nextIntervalDays(newStability));
      if (rating === 2) {
        scheduledDays = Math.max(1, Math.min(hardInterval, Math.round(safeS * 1.2) || 1));
      } else if (rating === 3) {
        scheduledDays = Math.max(1, nextIntervalDays(newStability));
      } else {
        scheduledDays = Math.max(nextIntervalDays(newStability), Math.round(safeS * 1.3) + 1);
      }
      intervalMinutes = scheduledDays * 1440;
    }
  }

  intervalMinutes = clamp(intervalMinutes, 1, MAX_INTERVAL_DAYS * 1440);
  const dueDate = new Date(nowMs + intervalMinutes * 60000);

  return {
    state: newState,
    stability: Number(clamp(newStability, 0.1, MAX_INTERVAL_DAYS).toFixed(4)),
    difficulty: Number(clamp(newDifficulty, 1, 10).toFixed(4)),
    reps: newReps,
    lapses: newLapses,
    elapsedDays: Number(Math.max(0, elapsedDays).toFixed(4)),
    scheduledDays: clamp(Math.round(scheduledDays), 0, MAX_INTERVAL_DAYS),
    lastReview: safeNow.toISOString(),
    due: dueDate.toISOString(),
    intervalMinutes
  };
}

export function formatIntervalFa(minutes: number): string {
  const m = clamp(minutes, 1, MAX_INTERVAL_DAYS * 1440);
  if (m < 60) {
    return `${toFaDigits(Math.max(1, Math.round(m)))} دقیقه`;
  }
  const hours = m / 60;
  if (hours < 24) {
    return `${toFaDigits(Math.round(hours))} ساعت`;
  }
  const days = Math.round(m / 1440);
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
  return entry.state === 2 && safeNum(entry.stability, 0) >= 21;
}

export function isEntryDue(entry: NotebookEntry, nowMs: number = Date.now()): boolean {
  const dueMs = new Date(entry.due).getTime();
  if (!Number.isFinite(dueMs)) return true;
  return dueMs <= nowMs;
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
    label: `پایداری ${toFaDigits(Math.max(1, Math.round(safeNum(entry.stability, 1))))} روز`,
    tone: 'review'
  };
}
