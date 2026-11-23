import { useCallback, useEffect, useMemo, useState } from 'react';
import { Volume2, RotateCcw, Brain, Sparkles, CheckCircle2 } from 'lucide-react';
import {
  AppSettings,
  CategoryId,
  NotebookEntry,
  Rating,
  ReviewStudyMode
} from '../types';
import { CATEGORIES, getCategorySafe } from '../config/categories';
import { submitCardReview } from '../db/database';
import { isEntryDue, previewCardRatings } from '../lib/fsrs';
import { playPronunciation } from '../lib/audio';
import { toFaDigits } from '../lib/jalali';

interface ReviewViewProps {
  entries: NotebookEntry[];
  sessions: string[];
  settings: AppSettings;
  onNotify: (type: 'ok' | 'err' | 'info', text: string) => void;
  onDataMutated: () => void;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildClozeSentence(example?: string, target?: string): string | null {
  const ex = String(example || '').trim();
  const tgt = String(target || '').trim();
  if (!ex || !tgt) return null;

  const cleanTarget = tgt.replace(/\([^)]*\)/g, '').trim();
  if (cleanTarget.length < 2) return null;

  const exactRegex = new RegExp(escapeRegExp(cleanTarget), 'i');
  if (exactRegex.test(ex)) {
    return ex.replace(exactRegex, '________');
  }

  const firstWord = cleanTarget.split(/\s+/)[0] || '';
  if (firstWord.length >= 4) {
    const stem = firstWord.slice(0, Math.max(4, firstWord.length - 2));
    const stemRegex = new RegExp(`\\b${escapeRegExp(stem)}[a-zA-Z'-]*\\b`, 'i');
    if (stemRegex.test(ex)) {
      return ex.replace(stemRegex, '________');
    }
  }

  return null;
}

export function ReviewView({
  entries,
  sessions,
  settings,
  onNotify,
  onDataMutated
}: ReviewViewProps) {
  const [scope, setScope] = useState<'due' | 'practice'>('due');
  const [studyMode, setStudyMode] = useState<ReviewStudyMode>('standard');
  const [categoryFilter, setCategoryFilter] = useState<CategoryId | 'all'>('all');
  const [sessionFilter, setSessionFilter] = useState<string>('');
  const [onlyFavorites, setOnlyFavorites] = useState<boolean>(false);

  const [sessionActive, setSessionActive] = useState<boolean>(false);
  const [queue, setQueue] = useState<NotebookEntry[]>([]);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [initialTotal, setInitialTotal] = useState<number>(0);
  const [flipped, setFlipped] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);

  const candidateCards = useMemo(() => {
    const nowMs = Date.now();
    return entries.filter((item) => {
      if (categoryFilter !== 'all' && item.category !== categoryFilter) return false;
      if (sessionFilter && item.session !== sessionFilter) return false;
      if (onlyFavorites && !item.favorite) return false;
      if (scope === 'due' && !isEntryDue(item, nowMs)) return false;
      return true;
    });
  }, [entries, categoryFilter, sessionFilter, onlyFavorites, scope]);

  const currentCard = queue[0] ?? null;

  const ratingPreviews = useMemo(() => {
    if (!currentCard) return null;
    try {
      return previewCardRatings(currentCard);
    } catch {
      return { 1: '۵ دقیقه', 2: '۱ روز', 3: '۳ روز', 4: '۵ روز' };
    }
  }, [currentCard]);

  const startSession = () => {
    const list = [...candidateCards];
    if (scope === 'due') {
      list.sort((a, b) => {
        const ta = new Date(a.due).getTime();
        const tb = new Date(b.due).getTime();
        return (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
      });
    } else {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    const capped = list.slice(0, 60);
    setQueue(capped);
    setInitialTotal(capped.length);
    setCompletedCount(0);
    setFlipped(false);
    setBusy(false);
    setSessionActive(true);
  };

  const handleRate = useCallback(
    async (rating: Rating) => {
      if (!currentCard || busy) return;
      setBusy(true);
      try {
        const updated = await submitCardReview(currentCard.id, rating);
        onDataMutated();

        if (rating === 1 && updated) {
          setQueue((prev) => {
            const rest = prev.slice(1);
            const insertAt = Math.min(2, rest.length);
            const nextQueue = [...rest];
            nextQueue.splice(insertAt, 0, updated);
            return nextQueue;
          });
        } else {
          setQueue((prev) => prev.slice(1));
          setCompletedCount((c) => c + 1);
        }
        setFlipped(false);
      } catch (err) {
        console.error('Review submit error:', err);
        onNotify(
          'err',
          err instanceof Error ? err.message : 'خطا در ثبت نتیجه مرور؛ دوباره تلاش کن.'
        );
      } finally {
        setBusy(false);
      }
    },
    [currentCard, busy, onDataMutated, onNotify]
  );

  useEffect(() => {
    if (!sessionActive || !currentCard) return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || '').toUpperCase();
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return;

      if (e.code === 'Space') {
        e.preventDefault();
        setFlipped((v) => !v);
      } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
        e.preventDefault();
        void handleRate(Number(e.key) as Rating);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sessionActive, currentCard, flipped, handleRate]);

  if (!sessionActive) {
    return (
      <div className="space-y-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-4">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-brand/10 dark:bg-blue-500/20 text-brand dark:text-blue-400 flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                مرور هوشمند با الگوریتم FSRS-5
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                زمان‌بندی علمی یادآوری متناسب با حافظه واقعی هر کارت
              </p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-2">
              شیوه تمرین کارت‌ها
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {(
                [
                  {
                    id: 'standard',
                    title: 'کلاسیک (EN ➔ FA)',
                    desc: 'انگلیسی روی کارت، معنی پشت کارت'
                  },
                  {
                    id: 'cloze',
                    title: 'بافت جمله (Cloze)',
                    desc: 'جای خالی داخل مثال + راهنمای فارسی'
                  },
                  {
                    id: 'reverse',
                    title: 'تولید فعال (FA ➔ EN)',
                    desc: 'فارسی را ببین و انگلیسی‌اش را بگو'
                  }
                ] as Array<{ id: ReviewStudyMode; title: string; desc: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setStudyMode(m.id)}
                  className={`p-3 rounded-xl border-2 text-right transition ${
                    studyMode === m.id
                      ? 'border-brand bg-brand-soft/60 dark:bg-blue-950/50'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40'
                  }`}
                >
                  <div className="text-xs font-extrabold text-slate-900 dark:text-white">
                    {m.title}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    {m.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                دامنه کارت‌ها
              </label>
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as 'due' | 'practice')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="due">مرور هوشمند امروز (FSRS)</option>
                <option value="practice">تمرین آزاد (تصادفی همه موارد)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                دسته‌بندی
              </label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value as CategoryId | 'all')}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="all">همه دسته‌ها</option>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                جلسه / منبع
              </label>
              <select
                value={sessionFilter}
                onChange={(e) => setSessionFilter(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
              >
                <option value="">همه جلسات</option>
                {sessions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyFavorites}
              onChange={(e) => setOnlyFavorites(e.target.checked)}
              className="rounded border-slate-300 text-brand focus:ring-brand"
            />
            فقط موارد نشان‌دار شده (★)
          </label>

          <button
            type="button"
            disabled={candidateCards.length === 0}
            onClick={startSession}
            className="w-full py-3.5 rounded-2xl bg-brand hover:bg-brand-hover text-white font-extrabold text-sm shadow-md disabled:opacity-45 transition"
          >
            {candidateCards.length > 0
              ? `شروع جلسه مرور (${toFaDigits(candidateCards.length)} کارت)`
              : scope === 'due'
              ? 'همه کارت‌های امروز مرور شده‌اند! (تمرین آزاد را امتحان کن)'
              : 'کارتی با این فیلترها وجود ندارد'}
          </button>
        </div>
      </div>
    );
  }

  if (!currentCard) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-8 text-center shadow-sm space-y-4">
        <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
          جلسه مرور با موفقیت تمام شد!
        </h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {toFaDigits(completedCount)} کارت را مرور کردی و تاریخ یادآوری بعدی هرکدام توسط FSRS
          به‌روزرسانی شد.
        </p>
        <button
          type="button"
          onClick={() => setSessionActive(false)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-bold text-sm"
        >
          <RotateCcw className="w-4 h-4" />
          بازگشت به تنظیمات مرور
        </button>
      </div>
    );
  }

  const cat = getCategorySafe(currentCard.category);
  const clozeText =
    studyMode === 'cloze'
      ? buildClozeSentence(currentCard.example, currentCard.english)
      : null;
  const progressPct =
    initialTotal > 0 ? Math.min(100, Math.round((completedCount / initialTotal) * 100)) : 0;

  return (
    <div className="space-y-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 shadow-sm">
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="font-bold text-slate-700 dark:text-slate-200">
            پیشرفت: {toFaDigits(completedCount)} از {toFaDigits(initialTotal)} (باقی‌مانده:{' '}
            {toFaDigits(queue.length)})
          </span>
          <button
            type="button"
            onClick={() => setSessionActive(false)}
            className="text-slate-500 hover:text-rose-600 font-semibold"
          >
            پایان جلسه
          </button>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div
        onClick={() => setFlipped((v) => !v)}
        className="min-h-[260px] bg-white dark:bg-slate-900 rounded-3xl border-2 border-slate-200 dark:border-slate-700 p-5 sm:p-6 shadow-md flex flex-col justify-between cursor-pointer select-none transition hover:border-brand/50"
      >
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span
            className="text-xs font-bold px-3 py-1 rounded-full"
            style={{
              backgroundColor: settings.darkMode ? cat.darkSoftBg : cat.softBg,
              color: settings.darkMode ? '#f1f5f9' : cat.color
            }}
          >
            {cat.label}
          </span>
          {currentCard.session && (
            <span className="text-xs text-slate-400">{currentCard.session}</span>
          )}
        </div>

        <div className="my-5 text-center space-y-3">
          {studyMode === 'reverse' ? (
            <>
              <div className="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white leading-relaxed">
                {currentCard.persian}
              </div>
              {currentCard.meta && (
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  راهنما: {currentCard.meta}
                </div>
              )}
            </>
          ) : studyMode === 'cloze' && clozeText ? (
            <>
              <div className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                جای خالی را حدس بزن
              </div>
              <div className="dir-ltr text-lg sm:text-xl font-bold text-slate-900 dark:text-white leading-relaxed px-2">
                {clozeText}
              </div>
              <div className="text-sm text-slate-600 dark:text-slate-300">
                ({currentCard.persian})
              </div>
            </>
          ) : (
            <>
              <div className="dir-ltr text-2xl sm:text-3xl font-extrabold text-brand dark:text-blue-300 break-words">
                {currentCard.english}
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void playPronunciation(currentCard.english, settings.accent);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 dark:hover:bg-slate-700"
              >
                <Volume2 className="w-4 h-4" />
                پخش تلفظ
              </button>
            </>
          )}
        </div>

        {flipped ? (
          <div className="pt-4 border-t border-dashed border-slate-200 dark:border-slate-700 space-y-2.5 text-right">
            {studyMode !== 'standard' && (
              <div className="flex items-center justify-between gap-2 bg-brand-soft/60 dark:bg-blue-950/50 px-3.5 py-2.5 rounded-xl">
                <span className="dir-ltr text-lg font-extrabold text-brand dark:text-blue-300">
                  {currentCard.english}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void playPronunciation(currentCard.english, settings.accent);
                  }}
                  className="p-1.5 rounded-lg bg-white dark:bg-slate-800 text-brand dark:text-blue-300 shadow-sm"
                >
                  <Volume2 className="w-4 h-4" />
                </button>
              </div>
            )}

            <div className="text-base font-bold text-slate-900 dark:text-white">
              {currentCard.persian}
            </div>

            {currentCard.meta && (
              <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                <b>{cat.metaLabel}: </b>
                {currentCard.meta}
              </div>
            )}

            {currentCard.example && (
              <div className="dir-ltr text-xs sm:text-sm text-slate-600 dark:text-slate-300 pl-3 border-l-2 border-brand/50 italic flex items-center justify-between gap-2">
                <span>{currentCard.example}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void playPronunciation(currentCard.example, settings.accent);
                  }}
                  className="p-1 text-slate-400 hover:text-brand shrink-0"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {currentCard.notes && (
              <div className="text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap">
                {currentCard.notes}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-xs text-slate-400 pt-2">
            برای دیدن پاسخ روی کارت ضربه بزن (یا کلید Space)
          </div>
        )}
      </div>

      {flipped && ratingPreviews && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRate(1)}
            className="flex flex-col items-center py-3 px-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white shadow-sm disabled:opacity-50 transition"
          >
            <span className="text-sm font-extrabold">دوباره</span>
            <span className="text-[11px] opacity-90">{ratingPreviews[1]}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRate(2)}
            className="flex flex-col items-center py-3 px-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white shadow-sm disabled:opacity-50 transition"
          >
            <span className="text-sm font-extrabold">سخت</span>
            <span className="text-[11px] opacity-90">{ratingPreviews[2]}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRate(3)}
            className="flex flex-col items-center py-3 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-50 transition"
          >
            <span className="text-sm font-extrabold">خوب</span>
            <span className="text-[11px] opacity-90">{ratingPreviews[3]}</span>
          </button>

          <button
            type="button"
            disabled={busy}
            onClick={() => void handleRate(4)}
            className="flex flex-col items-center py-3 px-2 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 transition"
          >
            <span className="text-sm font-extrabold">آسان</span>
            <span className="text-[11px] opacity-90">{ratingPreviews[4]}</span>
          </button>
        </div>
      )}
    </div>
  );
}
