import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Volume2,
  Mic,
  MicOff,
  Sparkles,
  Star,
  Pencil,
  Trash2,
  X,
  AlertCircle,
  Check
} from 'lucide-react';
import { AppSettings, CategoryId, NotebookEntry } from '../types';
import { CATEGORIES, getCategorySafe } from '../config/categories';
import {
  findDuplicateEntries,
  saveLocalEntry,
  softDeleteEntry,
  toggleFavoriteEntry
} from '../db/database';
import {
  isDictationSupported,
  playPronunciation,
  startEnglishDictation
} from '../lib/audio';
import { enrichWithGemini } from '../lib/ai';
import { formatJalaliDate, formatJalaliTime, toFaDigits } from '../lib/jalali';
import { getMasteryBadge } from '../lib/fsrs';

interface AddEditViewProps {
  entries: NotebookEntry[];
  sessions: string[];
  settings: AppSettings;
  editingEntry: NotebookEntry | null;
  onClearEditing: () => void;
  onStartEdit: (entry: NotebookEntry) => void;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  onNotify: (type: 'ok' | 'err' | 'info', text: string) => void;
  onDataMutated: () => void;
}

export function AddEditView({
  entries,
  sessions,
  settings,
  editingEntry,
  onClearEditing,
  onStartEdit,
  onUpdateSettings,
  onNotify,
  onDataMutated
}: AddEditViewProps) {
  const [category, setCategory] = useState<CategoryId>('word');
  const [session, setSession] = useState<string>(settings.lastSession || '');
  const [english, setEnglish] = useState<string>('');
  const [persian, setPersian] = useState<string>('');
  const [meta, setMeta] = useState<string>('');
  const [example, setExample] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [favorite, setFavorite] = useState<boolean>(false);

  const [duplicates, setDuplicates] = useState<NotebookEntry[]>([]);
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [listening, setListening] = useState<boolean>(false);
  const stopDictationRef = useRef<(() => void) | null>(null);
  const englishInputRef = useRef<HTMLInputElement | null>(null);

  const dictationAvailable = useMemo(() => isDictationSupported(), []);

  // شمارش تعداد هر دسته
  const countsByCategory = useMemo(() => {
    const map: Record<CategoryId, number> = {
      word: 0,
      phrase: 0,
      grammar: 0,
      sentence: 0,
      phrasal: 0,
      speaking: 0
    };
    for (const e of entries) {
      map[e.category] = (map[e.category] || 0) + 1;
    }
    return map;
  }, [entries]);

  // آخرین ۱۲ مورد به ترتیب دقیق زمان ثبت (createdAt نزولی)
  const recentEntries = useMemo(() => {
    return [...entries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 12);
  }, [entries]);

  // بارگذاری فیلدها هنگام ورود به حالت ویرایش
  useEffect(() => {
    if (editingEntry) {
      setCategory(editingEntry.category);
      setSession(editingEntry.session);
      setEnglish(editingEntry.english);
      setPersian(editingEntry.persian);
      setMeta(editingEntry.meta);
      setExample(editingEntry.example);
      setNotes(editingEntry.notes);
      setFavorite(editingEntry.favorite);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [editingEntry]);

  // بررسی آنی تکراری بودن در IndexedDB (صفر میلی‌ثانیه!)
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      const found = await findDuplicateEntries(english, editingEntry?.id);
      if (!cancelled) setDuplicates(found);
    }, 200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [english, editingEntry?.id]);

  // میانبر Ctrl+Enter برای ذخیره سریع
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        void handleSubmit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  });

  const activeCat = getCategorySafe(category);

  const resetForm = (preserveSession: boolean) => {
    if (!preserveSession) {
      setSession('');
    }
    setEnglish('');
    setPersian('');
    setMeta('');
    setExample('');
    setNotes('');
    setFavorite(false);
    setDuplicates([]);
  };

  const handleSubmit = async () => {
    if (!english.trim()) {
      onNotify('err', 'لطفاً متن انگلیسی را وارد کن.');
      englishInputRef.current?.focus();
      return;
    }
    if (!persian.trim()) {
      onNotify('err', 'لطفاً معنی یا توضیح فارسی را وارد کن.');
      return;
    }

    try {
      await saveLocalEntry({
        id: editingEntry?.id,
        category,
        session,
        english,
        persian,
        meta,
        example,
        notes,
        favorite
      });

      if (settings.keepSession) {
        onUpdateSettings({ lastSession: session.trim() });
      }

      const wasEdit = Boolean(editingEntry);
      if (wasEdit) {
        onClearEditing();
      }
      resetForm(settings.keepSession);
      onNotify(
        'ok',
        wasEdit
          ? `تغییرات در دسته «${activeCat.label}» ذخیره شد.`
          : `در دسته «${activeCat.label}» ثبت شد.`
      );
      onDataMutated();
      englishInputRef.current?.focus();
    } catch (err) {
      onNotify('err', err instanceof Error ? err.message : 'خطا در ذخیره‌سازی');
    }
  };

  const handleAiEnrich = async () => {
    if (aiLoading) return;
    setAiLoading(true);
    try {
      const res = await enrichWithGemini({
        apiKey: settings.geminiApiKey,
        category,
        english,
        persian
      });
      if (res.english) setEnglish(res.english);
      if (res.persian) setPersian(res.persian);
      if (res.meta) setMeta(res.meta);
      if (res.example) setExample(res.example);
      if (res.notes) setNotes(res.notes);
      onNotify('ok', 'فیلدها با هوش مصنوعی تکمیل شدند — بررسی و ذخیره کن!');
    } catch (err) {
      onNotify('err', err instanceof Error ? err.message : 'خطا در ارتباط با هوش مصنوعی');
    } finally {
      setAiLoading(false);
    }
  };

  const handleToggleDictation = () => {
    if (listening) {
      stopDictationRef.current?.();
      setListening(false);
      return;
    }
    setListening(true);
    stopDictationRef.current = startEnglishDictation(
      settings.accent,
      (transcript) => {
        setEnglish((prev) => (prev ? `${prev} ${transcript}` : transcript));
      },
      (errMsg) => {
        onNotify('err', errMsg);
        setListening(false);
      },
      () => setListening(false)
    );
  };

  const handleDelete = async (entry: NotebookEntry) => {
    if (!window.confirm(`آیا از حذف «${entry.english}» مطمئنی؟`)) return;
    await softDeleteEntry(entry.id);
    if (editingEntry?.id === entry.id) {
      onClearEditing();
      resetForm(settings.keepSession);
    }
    onNotify('info', 'مورد موردنظر حذف شد.');
    onDataMutated();
  };

  return (
    <div className="space-y-4">
      {/* بنر ویرایش */}
      {editingEntry && (
        <div className="flex items-center justify-between gap-2 px-4 py-3 rounded-2xl bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-sm font-semibold">
          <span className="truncate">در حال ویرایش: {editingEntry.english}</span>
          <button
            type="button"
            onClick={() => {
              onClearEditing();
              resetForm(settings.keepSession);
            }}
            className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white dark:bg-slate-800 text-xs font-bold shadow-sm shrink-0"
          >
            <X className="w-3.5 h-3.5" />
            لغو ویرایش
          </button>
        </div>
      )}

      {/* کارت اصلی فرم */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        {/* انتخاب دسته‌بندی */}
        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
            ۱. دسته‌بندی را انتخاب کن
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {CATEGORIES.map((cat) => {
              const selected = cat.id === category;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  style={
                    selected
                      ? {
                          borderColor: cat.color,
                          backgroundColor: settings.darkMode ? cat.darkSoftBg : cat.softBg
                        }
                      : undefined
                  }
                  className={`flex flex-col items-start gap-0.5 p-2.5 rounded-xl border-2 text-right transition ${
                    selected
                      ? 'shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="w-full flex items-center justify-between gap-1">
                    <span
                      className="text-xs font-bold"
                      style={selected ? { color: settings.darkMode ? '#f8fafc' : cat.color } : undefined}
                    >
                      {cat.label}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-black/5 dark:bg-white/10 font-bold text-slate-600 dark:text-slate-300">
                      {toFaDigits(countsByCategory[cat.id] || 0)}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 dir-ltr">{cat.enLabel}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* جلسه / منبع */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="nb-session"
              className="text-xs font-bold text-slate-700 dark:text-slate-300"
            >
              جلسه / منبع (اختیاری)
            </label>
            <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={settings.keepSession}
                onChange={(e) =>
                  onUpdateSettings({
                    keepSession: e.target.checked,
                    lastSession: e.target.checked ? session.trim() : ''
                  })
                }
                className="rounded border-slate-300 text-brand focus:ring-brand"
              />
              ثابت نگه دار برای ثبت بعدی
            </label>
          </div>
          <input
            id="nb-session"
            list="nb-sessions-datalist"
            value={session}
            onChange={(e) => setSession(e.target.value)}
            placeholder="مثلاً: Session 12 - Unit 4 یا Friends Ep.1"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
          />
          <datalist id="nb-sessions-datalist">
            {sessions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>

        {/* متن انگلیسی + تلفظ + میکروفون + تکمیل هوشمند */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="nb-english"
              className="text-xs font-bold text-slate-700 dark:text-slate-300"
            >
              متن انگلیسی *
            </label>
            <button
              type="button"
              onClick={handleAiEnrich}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gradient-to-l from-indigo-600 to-blue-600 text-white text-[11px] font-bold shadow-sm hover:opacity-95 disabled:opacity-50 transition"
              title="تکمیل خودکار معنی، تلفظ، مثال و نکات با Gemini"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiLoading ? 'animate-spin' : ''}`} />
              {aiLoading ? 'در حال تکمیل...' : 'تکمیل هوشمند AI'}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              ref={englishInputRef}
              id="nb-english"
              value={english}
              onChange={(e) => setEnglish(e.target.value)}
              placeholder={activeCat.englishPlaceholder}
              autoComplete="off"
              className="flex-1 dir-ltr px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-medium focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
            />
            <button
              type="button"
              onClick={() => void playPronunciation(english, settings.accent)}
              disabled={!english.trim()}
              className="px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-40 transition"
              title="پخش تلفظ انگلیسی"
            >
              <Volume2 className="w-5 h-5" />
            </button>
            {dictationAvailable && (
              <button
                type="button"
                onClick={handleToggleDictation}
                className={`px-3 rounded-xl transition ${
                  listening
                    ? 'bg-rose-600 text-white animate-pulse'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title="ثبت با صدا (انگلیسی)"
              >
                {listening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>
            )}
          </div>

          {duplicates.length > 0 && (
            <div className="mt-2 p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-xs space-y-1">
              <div className="flex items-center gap-1.5 font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                مورد مشابه قبلاً در دفترچه ثبت شده:
              </div>
              {duplicates.map((d) => (
                <div key={d.id} className="pr-5">
                  • در «{getCategorySafe(d.category).label}»: <b className="dir-ltr">{d.english}</b> —{' '}
                  {d.persian}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* معنی فارسی */}
        <div>
          <label
            htmlFor="nb-persian"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            معنی / توضیح فارسی *
          </label>
          <input
            id="nb-persian"
            value={persian}
            onChange={(e) => setPersian(e.target.value)}
            placeholder={activeCat.persianPlaceholder}
            autoComplete="off"
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
          />
        </div>

        {/* فیلد پویا متناسب با دسته */}
        <div>
          <label
            htmlFor="nb-meta"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            {activeCat.metaLabel} (اختیاری)
          </label>
          <input
            id="nb-meta"
            value={meta}
            onChange={(e) => setMeta(e.target.value)}
            placeholder={activeCat.metaPlaceholder}
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
          />
        </div>

        {/* مثال انگلیسی */}
        <div>
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <label
              htmlFor="nb-example"
              className="text-xs font-bold text-slate-700 dark:text-slate-300"
            >
              مثال انگلیسی (برای مرور در بافت جمله)
            </label>
            {example.trim() && (
              <button
                type="button"
                onClick={() => void playPronunciation(example, settings.accent)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-brand dark:text-blue-400 hover:underline"
              >
                <Volume2 className="w-3.5 h-3.5" />
                پخش مثال
              </button>
            )}
          </div>
          <textarea
            id="nb-example"
            rows={2}
            value={example}
            onChange={(e) => setExample(e.target.value)}
            placeholder={activeCat.examplePlaceholder}
            className="w-full dir-ltr px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-y"
          />
        </div>

        {/* توضیحات تکمیلی */}
        <div>
          <label
            htmlFor="nb-notes"
            className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5"
          >
            توضیحات تکمیلی / مترادف / نکات استاد (اختیاری)
          </label>
          <textarea
            id="nb-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="نکات تکمیلی، مترادف‌ها، متضادها یا خطاهای رایج..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/70 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-y"
          />
        </div>

        {/* دکمه‌های عملیات */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            className="flex-1 min-w-[160px] flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-sm transition"
          >
            <Check className="w-4 h-4" />
            {editingEntry ? 'ثبت تغییرات ویرایش' : 'ذخیره در دفترچه'}
          </button>

          <button
            type="button"
            onClick={() => setFavorite((v) => !v)}
            className={`p-3 rounded-xl border transition ${
              favorite
                ? 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700 text-amber-500'
                : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-400'
            }`}
            title="نشان‌دار کردن به‌عنوان مورد مهم"
          >
            <Star className={`w-5 h-5 ${favorite ? 'fill-amber-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => resetForm(false)}
            className="py-3 px-4 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold text-sm transition"
          >
            پاک کردن
          </button>
        </div>
        <div className="hidden sm:block text-[11px] text-slate-400 text-left">
          میانبر ذخیره سریع: Ctrl + Enter
        </div>
      </div>

      {/* آخرین موارد ثبت‌شده به ترتیب واقعی زمان */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold text-slate-800 dark:text-slate-100">
            آخرین موارد ثبت‌شده
          </h2>
          <span className="text-[11px] text-slate-400">
            مرتب‌شده بر اساس زمان دقیق ثبت
          </span>
        </div>

        {recentEntries.length === 0 ? (
          <div className="text-center py-8 text-sm text-slate-400">
            هنوز یادداشتی ثبت نکردی. اولین کلمه یا اصطلاح کلاست را همین بالا وارد کن!
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentEntries.map((item) => {
              const cat = getCategorySafe(item.category);
              const badge = getMasteryBadge(item);
              return (
                <div
                  key={item.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300 dark:hover:border-slate-700 transition"
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className="text-[11px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: settings.darkMode ? cat.darkSoftBg : cat.softBg,
                          color: settings.darkMode ? '#e2e8f0' : cat.color
                        }}
                      >
                        {cat.label}
                      </span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                        {badge.label}
                      </span>
                      {item.session && (
                        <span className="text-[11px] text-slate-400">• {item.session}</span>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {formatJalaliDate(item.createdAt)} — {formatJalaliTime(item.createdAt)}
                    </span>
                  </div>

                  <div className="dir-ltr text-base font-bold text-slate-900 dark:text-white mb-0.5">
                    {item.english}
                  </div>
                  <div className="text-sm text-slate-700 dark:text-slate-300">
                    {item.persian}
                  </div>

                  <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => void playPronunciation(item.english, settings.accent)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
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
                      className="p-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-amber-500"
                      title="نشان‌دار"
                    >
                      <Star
                        className={`w-3.5 h-3.5 ${
                          item.favorite ? 'fill-amber-400 text-amber-500' : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={() => onStartEdit(item)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      ویرایش
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      className="mr-auto inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold hover:bg-rose-100 dark:hover:bg-rose-900/50"
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
    </div>
  );
}
