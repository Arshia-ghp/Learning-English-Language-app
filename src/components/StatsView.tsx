import { useMemo } from 'react';
import { Flame, Award, BookOpen, Clock } from 'lucide-react';
import { NotebookEntry, ReviewLog } from '../types';
import { CATEGORIES } from '../config/categories';
import { isEntryDue, isEntryMastered } from '../lib/fsrs';
import { formatJalaliDate, getLocalDayKey, toFaDigits } from '../lib/jalali';

interface StatsViewProps {
  entries: NotebookEntry[];
  reviewLogs: ReviewLog[];
}

export function StatsView({ entries, reviewLogs }: StatsViewProps) {
  const stats = useMemo(() => {
    const nowMs = Date.now();
    const total = entries.length;
    const due = entries.filter((e) => isEntryDue(e, nowMs)).length;
    const mastered = entries.filter((e) => isEntryMastered(e)).length;

    // شمارش مرورها به تفکیک روز
    const countsByDay = new Map<string, number>();
    for (const log of reviewLogs) {
      countsByDay.set(log.dayKey, (countsByDay.get(log.dayKey) || 0) + 1);
    }

    // محاسبه زنجیره روزانه (Streak)
    let streak = 0;
    const cursor = new Date();
    const todayKey = getLocalDayKey(cursor);
    if (!countsByDay.has(todayKey)) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (countsByDay.has(getLocalDayKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }

    // نقشه حرارتی ۲۸ روز گذشته
    const heatmap: Array<{ dayKey: string; jalali: string; count: number }> = [];
    for (let i = 27; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dk = getLocalDayKey(d);
      heatmap.push({
        dayKey: dk,
        jalali: formatJalaliDate(d),
        count: countsByDay.get(dk) || 0
      });
    }

    const reviewedToday = countsByDay.get(todayKey) || 0;

    return { total, due, mastered, streak, heatmap, reviewedToday };
  }, [entries, reviewLogs]);

  const masteryRate =
    stats.total > 0 ? Math.round((stats.mastered / stats.total) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* کارت‌های KPI */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">کل یادداشت‌ها</span>
            <BookOpen className="w-4 h-4 text-brand dark:text-blue-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white">
            {toFaDigits(stats.total)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">آماده مرور</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-2xl font-extrabold text-rose-600 dark:text-rose-400">
            {toFaDigits(stats.due)}
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">تسلط کامل</span>
            <Award className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
            {toFaDigits(stats.mastered)}
            <span className="text-xs font-semibold text-slate-400 mr-1">
              ({toFaDigits(masteryRate)}٪)
            </span>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-bold">زنجیره روزانه</span>
            <Flame className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
            {toFaDigits(stats.streak)}
            <span className="text-xs font-semibold text-slate-400 mr-1">روز</span>
          </div>
        </div>
      </div>

      {/* نقشه حرارتی فعالیت ۲۸ روز اخیر */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              نقشه حرارتی مرور (۲۸ روز اخیر)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              مرور امروز: {toFaDigits(stats.reviewedToday)} کارت
            </p>
          </div>
          <span className="text-[11px] text-slate-400">کل مرورها: {toFaDigits(reviewLogs.length)}</span>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {stats.heatmap.map((cell) => {
            const bg =
              cell.count === 0
                ? 'bg-slate-100 dark:bg-slate-800'
                : cell.count < 5
                ? 'bg-emerald-200 dark:bg-emerald-900/70'
                : cell.count < 15
                ? 'bg-emerald-400 dark:bg-emerald-600'
                : 'bg-emerald-600 dark:bg-emerald-400';

            return (
              <div
                key={cell.dayKey}
                title={`${cell.jalali} — ${toFaDigits(cell.count)} مرور`}
                className={`h-9 rounded-xl ${bg} flex flex-col items-center justify-center text-[10px] font-bold transition`}
              >
                <span
                  className={
                    cell.count >= 5
                      ? 'text-white dark:text-slate-950'
                      : 'text-slate-500 dark:text-slate-400'
                  }
                >
                  {cell.count > 0 ? toFaDigits(cell.count) : '·'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* تفکیک پیشرفت بر اساس ۶ دسته‌بندی */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3.5">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
          وضعیت پیشرفت به تفکیک دسته‌بندی
        </h2>

        <div className="space-y-3">
          {CATEGORIES.map((cat) => {
            const list = entries.filter((e) => e.category === cat.id);
            const catMastered = list.filter((e) => isEntryMastered(e)).length;
            const catDue = list.filter((e) => isEntryDue(e)).length;
            const pct = list.length > 0 ? Math.round((catMastered / list.length) * 100) : 0;

            return (
              <div key={cat.id} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      {cat.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-[11px] text-slate-500 dark:text-slate-400">
                    <span>کل: {toFaDigits(list.length)}</span>
                    <span>مرور: {toFaDigits(catDue)}</span>
                    <span className="font-bold text-emerald-600 dark:text-emerald-400">
                      تسلط: {toFaDigits(pct)}٪
                    </span>
                  </div>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, backgroundColor: cat.color }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
