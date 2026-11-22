import {
  PlusCircle,
  BookOpen,
  Brain,
  BarChart3,
  Settings,
  Sun,
  Moon,
  RefreshCw,
  WifiOff,
  Cloud
} from 'lucide-react';
import { Accent, TabId } from '../types';
import { toFaDigits } from '../lib/jalali';

interface NavigationProps {
  activeTab: TabId;
  onSelectTab: (tab: TabId) => void;
  dueCount: number;
  pendingCount: number;
  online: boolean;
  darkMode: boolean;
  onToggleDark: () => void;
  accent: Accent;
  onChangeAccent: (acc: Accent) => void;
  cloudConnected: boolean;
  syncing: boolean;
  onSyncNow: () => void;
}

const NAV_ITEMS: Array<{ id: TabId; label: string; icon: typeof PlusCircle }> = [
  { id: 'add', label: 'ثبت', icon: PlusCircle },
  { id: 'library', label: 'بانک من', icon: BookOpen },
  { id: 'review', label: 'مرور', icon: Brain },
  { id: 'stats', label: 'آمار', icon: BarChart3 },
  { id: 'settings', label: 'تنظیمات', icon: Settings }
];

export function Navigation({
  activeTab,
  onSelectTab,
  dueCount,
  pendingCount,
  online,
  darkMode,
  onToggleDark,
  accent,
  onChangeAccent,
  cloudConnected,
  syncing,
  onSyncNow
}: NavigationProps) {
  return (
    <>
      {/* هدر موبایل و تبلت */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-3.5 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand text-white flex items-center justify-center font-bold text-sm shadow-sm">
              LF
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-900 dark:text-white leading-tight">
                دفترچه زبان من
              </h1>
              <div className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
                {online ? (
                  cloudConnected ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                      <Cloud className="w-3 h-3" />
                      {pendingCount > 0
                        ? `${toFaDigits(pendingCount)} مورد در انتظار سینک`
                        : 'همگام با ابر'}
                    </span>
                  ) : (
                    <span>ذخیره آفلاین روی دستگاه</span>
                  )
                ) : (
                  <span className="text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                    <WifiOff className="w-3 h-3" />
                    حالت آفلاین فعال
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-[11px] font-bold">
              <button
                type="button"
                onClick={() => onChangeAccent('en-US')}
                className={`px-2 py-1 transition ${
                  accent === 'en-US'
                    ? 'bg-brand text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                }`}
              >
                US
              </button>
              <button
                type="button"
                onClick={() => onChangeAccent('en-GB')}
                className={`px-2 py-1 transition ${
                  accent === 'en-GB'
                    ? 'bg-brand text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300'
                }`}
              >
                UK
              </button>
            </div>

            {cloudConnected && (
              <button
                type="button"
                onClick={onSyncNow}
                disabled={syncing || !online}
                className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 disabled:opacity-40"
                title="همگام‌سازی ابری"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              </button>
            )}

            <button
              type="button"
              onClick={onToggleDark}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
              title="حالت شب / روز"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </header>

      {/* سایدبار دسکتاپ */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:right-0 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 p-4 z-30">
        <div className="flex items-center gap-3 px-2 py-2 mb-5">
          <div className="w-10 h-10 rounded-2xl bg-brand text-white flex items-center justify-center font-extrabold text-base shadow-md">
            LF
          </div>
          <div>
            <div className="font-extrabold text-slate-900 dark:text-white text-base">
              LexiFlow
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              دفترچه هوشمند زبان
            </div>
          </div>
        </div>

        <nav className="flex-1 space-y-1.5">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-sm font-semibold transition ${
                  active
                    ? 'bg-brand text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-5 h-5" />
                  {item.label}
                </span>
                {item.id === 'review' && dueCount > 0 && (
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300'
                    }`}
                  >
                    {toFaDigits(dueCount)}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="text-slate-500 dark:text-slate-400">لهجه تلفظ</span>
            <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden font-bold">
              <button
                type="button"
                onClick={() => onChangeAccent('en-US')}
                className={`px-2.5 py-1 ${
                  accent === 'en-US'
                    ? 'bg-brand text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                US
              </button>
              <button
                type="button"
                onClick={() => onChangeAccent('en-GB')}
                className={`px-2.5 py-1 ${
                  accent === 'en-GB'
                    ? 'bg-brand text-white'
                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                UK
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onToggleDark}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {darkMode ? 'حالت روشن' : 'حالت شب'}
            </button>

            {cloudConnected && (
              <button
                type="button"
                onClick={onSyncNow}
                disabled={syncing || !online}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-brand/10 text-brand dark:bg-blue-500/20 dark:text-blue-300 text-xs font-bold disabled:opacity-40"
                title="همگام‌سازی ابری"
              >
                <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                سینک
              </button>
            )}
          </div>

          <div className="text-[11px] text-center text-slate-400">
            {!online ? (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">
                ● آفلاین (ذخیره روی دستگاه)
              </span>
            ) : cloudConnected ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                ● آنلاین{' '}
                {pendingCount > 0 ? `(${toFaDigits(pendingCount)} در انتظار)` : '(همگام)'}
              </span>
            ) : (
              <span>● آنلاین (ذخیره‌سازی محلی)</span>
            )}
          </div>
        </div>
      </aside>

      {/* نوار ناوبری پایین مخصوص موبایل */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="grid grid-cols-5 px-1 pt-1.5 pb-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-1 rounded-xl transition ${
                  active
                    ? 'text-brand dark:text-blue-400 font-bold'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <div className="relative">
                  <Icon className={`w-5 h-5 ${active ? 'scale-110 transition-transform' : ''}`} />
                  {item.id === 'review' && dueCount > 0 && (
                    <span className="absolute -top-1.5 -left-2.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center">
                      {toFaDigits(dueCount > 99 ? '99+' : dueCount)}
                    </span>
                  )}
                </div>
                <span className="text-[10px]">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
