import { useRef, useState } from 'react';
import {
  Cloud,
  RefreshCw,
  LogIn,
  LogOut,
  Sparkles,
  Download,
  Upload,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Database,
  KeyRound,
  ShieldCheck
} from 'lucide-react';
import { User } from '@supabase/supabase-js';
import { AppSettings, CategoryId, SyncProvider, ThemeId } from '../types';
import { CATEGORIES, THEMES } from '../config/categories';
import { cloudSignIn, cloudSignOut, cloudSignUp, resolveSupabaseConfig } from '../lib/sync';
import { markAllLocalPending } from '../lib/sheetsSync';
import {
  exportAnkiCsv,
  exportJsonBackup,
  importGoogleSheetCsv,
  importJsonBackup
} from '../lib/exportImport';
import { formatJalaliDate, formatJalaliTime, toFaDigits } from '../lib/jalali';

interface SettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (patch: Partial<AppSettings>) => void;
  cloudUser: User | null;
  onCloudUserChange: (user: User | null) => void;
  pendingCount: number;
  syncing: boolean;
  onSyncNow: () => void;
  onNotify: (type: 'ok' | 'err' | 'info', text: string) => void;
  onDataMutated: () => void;
}

export function SettingsView({
  settings,
  onUpdateSettings,
  cloudUser,
  onCloudUserChange,
  pendingCount,
  syncing,
  onSyncNow,
  onNotify,
  onDataMutated
}: SettingsViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [showGeminiKey, setShowGeminiKey] = useState(false);
  const [showSheetPin, setShowSheetPin] = useState(false);
  const [csvTargetCategory, setCsvTargetCategory] = useState<CategoryId>('word');

  const jsonInputRef = useRef<HTMLInputElement | null>(null);
  const csvInputRef = useRef<HTMLInputElement | null>(null);

  const resolvedCloud = resolveSupabaseConfig(settings.supabaseUrl, settings.supabaseAnonKey);
  const hasSupabaseConfig = Boolean(resolvedCloud.url && resolvedCloud.anonKey);
  const hasSheetsConfig = Boolean(
    settings.sheetsWebAppUrl.trim().startsWith('https://script.google.com/') &&
      settings.sheetsSecretPin.trim()
  );

  const handleAuth = async (mode: 'signin' | 'signup') => {
    if (!email.trim() || password.length < 6) {
      onNotify('err', 'ایمیل معتبر و رمز عبور حداقل ۶ کاراکتری وارد کن.');
      return;
    }
    setAuthBusy(true);
    try {
      if (mode === 'signin') {
        const user = await cloudSignIn(
          email.trim(),
          password,
          settings.supabaseUrl,
          settings.supabaseAnonKey
        );
        onCloudUserChange(user);
        onNotify('ok', 'ورود با موفقیت انجام شد!');
        onSyncNow();
      } else {
        const res = await cloudSignUp(
          email.trim(),
          password,
          settings.supabaseUrl,
          settings.supabaseAnonKey
        );
        if (res.needsConfirmation) {
          onNotify('info', 'حساب ساخته شد. ایمیل خود را تأیید کرده و سپس وارد شو.');
        } else if (res.user) {
          onCloudUserChange(res.user);
          onNotify('ok', 'حساب ابری ساخته و متصل شد!');
          onSyncNow();
        }
      }
      setPassword('');
    } catch (err) {
      onNotify('err', err instanceof Error ? err.message : 'خطا در احراز هویت');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleSignOut = async () => {
    await cloudSignOut(settings.supabaseUrl, settings.supabaseAnonKey);
    onCloudUserChange(null);
    onUpdateSettings({ lastSyncedAt: null });
    onNotify('info', 'از حساب Supabase خارج شدی. داده‌های محلی همچنان روی دستگاه محفوظ‌اند.');
  };

  const handleForceUploadToSheets = async () => {
    const count = await markAllLocalPending();
    onNotify('info', `در حال ارسال ${toFaDigits(count)} یادداشت به گوگل شیت...`);
    onSyncNow();
  };

  const handleImportJson = async (file: File | undefined) => {
    if (!file) return;
    try {
      const res = await importJsonBackup(file);
      onNotify(
        'ok',
        `بکاپ بازیابی شد: ${toFaDigits(res.added)} مورد جدید و ${toFaDigits(res.updated)} مورد به‌روزرسانی شد.`
      );
      onDataMutated();
    } catch (err) {
      onNotify('err', err instanceof Error ? err.message : 'خطا در خواندن فایل بکاپ');
    }
  };

  const handleImportCsv = async (file: File | undefined) => {
    if (!file) return;
    try {
      const count = await importGoogleSheetCsv(file, csvTargetCategory);
      onNotify('ok', `${toFaDigits(count)} مورد از فایل CSV گوگل شیت با موفقیت وارد شد!`);
      onDataMutated();
    } catch (err) {
      onNotify('err', err instanceof Error ? err.message : 'خطا در وارد کردن CSV');
    }
  };

  return (
    <div className="space-y-4">
      {/* ظاهر و تم رنگی */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
          ظاهر و شخصی‌سازی
        </h2>

        <div>
          <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-2">
            رنگ اصلی پوسته
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(Object.keys(THEMES) as ThemeId[]).map((id) => {
              const t = THEMES[id];
              const active = settings.theme === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => onUpdateSettings({ theme: id })}
                  className={`flex items-center gap-2 p-2.5 rounded-xl border-2 text-xs font-bold transition ${
                    active
                      ? 'border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800'
                      : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <span
                    className="w-5 h-5 rounded-full shrink-0"
                    style={{ backgroundColor: t.brand }}
                  />
                  <span>{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* همگام‌سازی ابری بین گوشی و لپ‌تاپ */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Cloud className="w-5 h-5 text-brand dark:text-blue-400" />
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              همگام‌سازی گوشی ⇄ لپ‌تاپ
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              گوگل شیت بدون فیلترشکن روی اینترنت ایران کار می‌کند و تمام لغات را در گوگل درایو ذخیره می‌کند
            </p>
          </div>
        </div>

        {/* انتخاب روش همگام‌سازی */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
          {(
            [
              { id: 'sheets', label: 'گوگل شیت (بدون فیلترشکن ★)' },
              { id: 'supabase', label: 'Supabase (نیاز به فیلترشکن)' }
            ] as Array<{ id: SyncProvider; label: string }>
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onUpdateSettings({ syncProvider: opt.id })}
              className={`py-2 px-2.5 rounded-lg text-xs font-bold transition ${
                settings.syncProvider === opt.id
                  ? 'bg-white dark:bg-slate-900 text-brand dark:text-blue-300 shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* پنل همگام‌سازی مستقیم با گوگل شیت */}
        {settings.syncProvider === 'sheets' && (
          <div className="space-y-3">
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-200 leading-relaxed flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                با این روش، تمام یادداشت‌ها هم روی حافظه گوشی/لپ‌تاپ (آفلاین ۰ میلی‌ثانیه‌ای) و هم
                مستقیماً در گوگل شیت شخصی خودت (بدون فیلترشکن) ذخیره و همگام می‌شوند.
              </span>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                لینک Web App گوگل شیت (پایان‌یافته به /exec)
              </label>
              <input
                value={settings.sheetsWebAppUrl}
                onChange={(e) => onUpdateSettings({ sheetsWebAppUrl: e.target.value })}
                placeholder="https://script.google.com/macros/s/AKfycb.../exec"
                className="w-full dir-ltr px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                رمز همگام‌سازی (SECRET_PIN)
              </label>
              <div className="flex gap-2">
                <input
                  type={showSheetPin ? 'text' : 'password'}
                  value={settings.sheetsSecretPin}
                  onChange={(e) => onUpdateSettings({ sheetsSecretPin: e.target.value })}
                  placeholder="رمزی که در فایل SyncBackend.gs گذاشتی"
                  className="flex-1 dir-ltr px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
                <button
                  type="button"
                  onClick={() => setShowSheetPin((v) => !v)}
                  className="px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                >
                  {showSheetPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {hasSheetsConfig && (
              <div className="space-y-2.5 pt-1">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  {settings.lastSyncedAt
                    ? `آخرین همگام‌سازی موفق: ${formatJalaliDate(settings.lastSyncedAt)} ساعت ${formatJalaliTime(settings.lastSyncedAt)}`
                    : 'هنوز همگام‌سازی انجام نشده است.'}
                  {pendingCount > 0 ? ` — ${toFaDigits(pendingCount)} مورد در صف ارسال` : ''}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={syncing}
                    onClick={onSyncNow}
                    className="flex-1 min-w-[160px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold disabled:opacity-50"
                  >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی با گوگل شیت'}
                  </button>

                  <button
                    type="button"
                    disabled={syncing}
                    onClick={() => void handleForceUploadToSheets()}
                    className="py-2.5 px-3.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-50"
                    title="ارسال کامل تمام لغات این دستگاه به گوگل شیت"
                  >
                    ارسال کل لغات این دستگاه
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* پنل Supabase */}
        {settings.syncProvider === 'supabase' && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Supabase Project URL
                </label>
                <input
                  value={settings.supabaseUrl}
                  onChange={(e) => onUpdateSettings({ supabaseUrl: e.target.value })}
                  placeholder="https://xxxxx.supabase.co"
                  className="w-full dir-ltr px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                  Supabase Anon Public Key
                </label>
                <input
                  type="password"
                  value={settings.supabaseAnonKey}
                  onChange={(e) => onUpdateSettings({ supabaseAnonKey: e.target.value })}
                  placeholder="eyJhbGciOiJIUzI1NiIs..."
                  className="w-full dir-ltr px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
                />
              </div>
            </div>

            {hasSupabaseConfig && (
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                {cloudUser ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3.5 py-2.5 rounded-xl text-xs">
                      <div>
                        <div className="font-bold text-emerald-800 dark:text-emerald-300">
                          متصل به حساب: <span className="dir-ltr">{cloudUser.email}</span>
                        </div>
                        <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-0.5">
                          {settings.lastSyncedAt
                            ? `آخرین همگام‌سازی: ${formatJalaliDate(settings.lastSyncedAt)} ساعت ${formatJalaliTime(settings.lastSyncedAt)}`
                            : 'هنوز همگام‌سازی انجام نشده'}
                          {pendingCount > 0 ? ` — ${toFaDigits(pendingCount)} تغییر در صف` : ''}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={syncing}
                        onClick={onSyncNow}
                        className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-brand text-white text-xs font-bold disabled:opacity-50"
                      >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'در حال همگام‌سازی...' : 'همگام‌سازی دستی همین الان'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSignOut()}
                        className="flex items-center gap-1.5 py-2.5 px-4 rounded-xl bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-bold"
                      >
                        <LogOut className="w-4 h-4" />
                        خروج
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="ایمیل شخصی شما"
                        className="w-full dir-ltr px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                      />
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="رمز عبور (حداقل ۶ کاراکتر)"
                        className="w-full dir-ltr px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={() => void handleAuth('signin')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-brand text-white text-xs font-bold disabled:opacity-50"
                      >
                        <LogIn className="w-4 h-4" />
                        ورود به حساب
                      </button>
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={() => void handleAuth('signup')}
                        className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold disabled:opacity-50"
                      >
                        ساخت حساب جدید
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* تنظیمات تکمیل هوشمند AI */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
              تکمیل هوشمند (فوری بدون کلید + پشتیبانی OpenRouter / Gemini)
            </h2>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              اگر خالی بگذاری زیر ۱ ثانیه با دیکشنری و مترجم فوری (بدون فیلترشکن) کار می‌کند
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <KeyRound className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type={showGeminiKey ? 'text' : 'password'}
              value={settings.geminiApiKey}
              onChange={(e) => onUpdateSettings({ geminiApiKey: e.target.value })}
              placeholder="اختیاری: کلید OpenRouter (sk-or-...) یا Gemini (AIza...)"
              className="w-full dir-ltr pl-3 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs"
            />
          </div>
          <button
            type="button"
            onClick={() => setShowGeminiKey((v) => !v)}
            className="px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
          >
            {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* بکاپ، خروجی Anki و انتقال از گوگل شیت قبلی */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          <h2 className="text-sm font-extrabold text-slate-900 dark:text-white">
            پشتیبان‌گیری، خروجی Anki و انتقال از گوگل شیت
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            onClick={async () => {
              const count = await exportJsonBackup();
              onNotify('ok', `فایل پشتیبان کامل (${toFaDigits(count)} مورد) دانلود شد.`);
            }}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100"
          >
            <Download className="w-4 h-4" />
            بکاپ کامل (JSON)
          </button>

          <button
            type="button"
            onClick={() => jsonInputRef.current?.click()}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold text-slate-800 dark:text-slate-100"
          >
            <Upload className="w-4 h-4" />
            بازیابی بکاپ (JSON)
          </button>
          <input
            ref={jsonInputRef}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(e) => {
              void handleImportJson(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          <button
            type="button"
            onClick={async () => {
              const count = await exportAnkiCsv('all');
              onNotify('ok', `فایل CSV سازگار با Anki (${toFaDigits(count)} کارت) دانلود شد.`);
            }}
            className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 hover:bg-emerald-100 text-xs font-bold text-emerald-700 dark:text-emerald-300"
          >
            <FileSpreadsheet className="w-4 h-4" />
            خروجی Anki (CSV)
          </button>
        </div>

        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            انتقال لغات از گوگل شیت قبلی (Import CSV)
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            در گوگل شیت قبلی از منوی File ➔ Download ➔ CSV خروجی بگیر، دسته مقصد را انتخاب کن و
            فایل را وارد کن:
          </p>
          <div className="flex flex-wrap gap-2">
            <select
              value={csvTargetCategory}
              onChange={(e) => setCsvTargetCategory(e.target.value as CategoryId)}
              className="flex-1 min-w-[140px] px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  مقصد: {c.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => csvInputRef.current?.click()}
              className="px-4 py-2 rounded-xl bg-brand text-white text-xs font-bold"
            >
              انتخاب فایل CSV و ورود
            </button>
            <input
              ref={csvInputRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                void handleImportCsv(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
