import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';
import { ToastMessage } from '../types';

interface ToastProps {
  toast: ToastMessage | null;
  onDismiss: () => void;
}

export function Toast({ toast, onDismiss }: ToastProps) {
  if (!toast) return null;

  const styles = {
    ok: 'bg-emerald-600 text-white shadow-emerald-600/25',
    err: 'bg-rose-600 text-white shadow-rose-600/25',
    info: 'bg-slate-800 text-white dark:bg-slate-100 dark:text-slate-900 shadow-slate-900/20'
  }[toast.type];

  const Icon =
    toast.type === 'ok' ? CheckCircle2 : toast.type === 'err' ? AlertCircle : Info;

  return (
    <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[92%] max-w-md pointer-events-none">
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 rounded-2xl shadow-lg text-sm font-medium transition-all ${styles}`}
      >
        <Icon className="w-5 h-5 shrink-0" />
        <span className="flex-1 leading-snug">{toast.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-lg hover:bg-black/15 transition"
          aria-label="بستن پیام"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
