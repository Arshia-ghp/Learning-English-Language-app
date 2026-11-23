import { useMemo, useState } from 'react';
import {
  Search,
  Volume2,
  Star,
  Pencil,
  Trash2,
  Filter,
  ArrowUpDown,
  Clock
} from 'lucide-react';
import { AppSettings, CategoryId, NotebookEntry } from '../types';
import { CATEGORIES, getCategorySafe } from '../config/categories';
import { normalizeSearch, softDeleteEntry, toggleFavoriteEntry } from '../db/database';
import { playPronunciation } from '../lib/audio';
import { formatJalaliDate, formatRelativeDueFa, toFaDigits } from '../lib/jalali';
import { getMasteryBadge, isEntryDue, isEntryMastered } from '../lib/fsrs';

interface LibraryViewProps {
  entries: NotebookEntry[];
  sessions: string[];
  settings: AppSettings;
  onStartEdit: (entry: NotebookEntry) => void;
  onNotify: (type: 'ok' | 'err' | 'info', text: string) => void;
  onDataMutated: () => void;
}

type StatusFilter = 'all' | 'due' | 'mastered' | 'favorite';
type SortBy = 'newest' | 'oldest' | 'alpha' | 'due';

export function LibraryView({
  entries,
  sessions,
  settings,
  onStartEdit,
  onNotify,
  onDataMutated
}: LibraryViewProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [sessionFilter, setSessionFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');

  const filtered = useMemo(() => {
    const q = normalizeSearch(query);
    const nowMs = Date.now();

    const list = entries.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (sessionFilter && item.session !== sessionFilter) return false;

      if (statusFilter === 'due' && !isEntryDue(item, nowMs)) return false;
      if (statusFilter === 'mastered' && !isEntryMastered(item)) return false;
      if (statusFilter === 'favorite' && !item.favorite) return false;

      if (q) {
        const hay = normalizeSearch(
          [item.english, item.persian, item.meta, item.example, item.notes, item.session].join(' ')
        );
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'newest') return b.createdAt.localeCompare(a.createdAt);
      if (sortBy === 'oldest') return a.createdAt.localeCompare(b.createdAt);
      if (sortBy === 'alpha') return a.english.localeCompare(b.english);
      return new Date(a.due).getTime() - new Date(b.due).getTime();
    });

    return list;
  }, [entries, query, category, sessionFilter, statusFilter, sortBy]);

  const handleDelete = async (entry: NotebookEntry) => {
    if (!window.confirm(`آیا از حذف «${entry.english}» مطمئنی؟`)) return;
    await softDeleteEntry(entry.id);
    onNotify('info', 'مورد از دفترچه حذف شد.');
    onDataMutated();
  };

  return (
    <div className="space-y-4">
      {/* پنل جستجو و فیلترها */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی آنی در انگلیسی، فارسی، مثال، توضیحات یا جلسه..."
            className="w-full pr-10 pl-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
          />
        </div>

        {/* چیپ‌های دسته‌بندی با اسکرول افقی نرم در موبایل */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setCategory('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
              category === 'all'
                ? 'bg-brand text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            همه ({toFaDigits(entries.length)})
          </button>
          {CATEGORIES.map((cat) => {
            const count = entries.filter((e) => e.category === cat.id).length;
            const active = category === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                  active
                    ? 'bg-brand text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {cat.shortLabel} ({toFaDigits(count)})
              </button>
            );
          })}
        </div>

        {/* فیلترهای تکمیلی */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="all">وضعیت: همه</option>
              <option value="due">آماده مرور امروز</option>
              <option value="mastered">تسلط کامل</option>
              <option value="favorite">نشان‌شده‌ها ★</option>
            </select>
          </div>

          <select
            value={sessionFilter}
            onChange={(e) => setSessionFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
          >
            <option value="">جلسه: همه جلسات</option>
            {sessions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="w-4 h-4 text-slate-400 shrink-0" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            >
              <option value="newest">مرتب‌سازی: جدیدترین</option>
              <option value="oldest">قدیمی‌ترین</option>
              <option value="alpha">الفبایی (A-Z)</option>
              <option value="due">زودترین موعد مرور</option>
            </select>
          </div>
        </div>
      </div>

      {/* لیست نتایج */}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500 dark:text-slate-400">
        <span>تعداد نتایج: {toFaDigits(filtered.length)} مورد</span>
        {(query || category !== 'all' || sessionFilter || statusFilter !== 'all') && (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('all');
              setSessionFilter('');
              setStatusFilter('all');
            }}
            className="text-brand dark:text-blue-400 font-bold hover:underline"
          >
            پاک کردن فیلترها
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-10 text-center text-sm text-slate-400">
          موردی با این فیلترها پیدا نشد.
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((item) => {
            const cat = getCategorySafe(item.category);
            const badge = getMasteryBadge(item);
            const dueNow = isEntryDue(item);

            return (
              <div
                key={item.id}
                className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition"
              >
                <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className="text-[11px] font-bold px-2.5 py-0.5 rounded-full"
                      style={{
                        backgroundColor: settings.darkMode ? cat.darkSoftBg : cat.softBg,
                        color: settings.darkMode ? '#e2e8f0' : cat.color
                      }}
                    >
                      {cat.label}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        badge.tone === 'mastered'
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          : dueNow
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {badge.label}
                    </span>
                    {item.session && (
                      <span className="text-[11px] text-slate-400">• {item.session}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelativeDueFa(item.due)}
                    </span>
                    <span>• {formatJalaliDate(item.createdAt)}</span>
                  </div>
                </div>

                <div className="dir-ltr text-lg font-bold text-slate-900 dark:text-white leading-snug">
                  {item.english}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-200 mt-1">
                  {item.persian}
                </div>

                {item.meta && (
                  <div className="mt-2 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-600 dark:text-slate-300">
                    <span className="font-bold">{cat.metaLabel}: </span>
                    <span>{item.meta}</span>
                  </div>
                )}

                {item.example && (
                  <div className="mt-2 dir-ltr pl-3 border-l-2 border-brand/50 text-xs text-slate-600 dark:text-slate-300 italic flex items-center justify-between gap-2">
                    <span>{item.example}</span>
                    <button
                      type="button"
                      onClick={() => void playPronunciation(item.example, settings.accent)}
                      className="p-1 text-slate-400 hover:text-brand shrink-0"
                      title="پخش مثال"
                    >
                      <Volume2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {item.notes && (
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 whitespace-pre-wrap leading-relaxed">
                    {item.notes}
                  </div>
                )}

                <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => void playPronunciation(item.english, settings.accent)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    تلفظ
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await toggleFavoriteEntry(item.id);
                      onDataMutated();
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:text-amber-500"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        item.favorite ? 'fill-amber-400 text-amber-500' : ''
                      }`}
                    />
                    {item.favorite ? 'نشان‌شده' : 'نشان'}
                  </button>
                  <button
                    type="button"
                    onClick={() => onStartEdit(item)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    ویرایش
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(item)}
                    className="mr-auto inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    حذف
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
