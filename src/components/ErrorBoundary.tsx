import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'خطای غیرمنتظره در نمایش صفحه'
    };
  }

  componentDidCatch(error: Error) {
    console.error('LexiFlow UI Error:', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          dir="rtl"
          className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-5"
        >
          <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 text-center shadow-lg space-y-4">
            <div className="w-14 h-14 mx-auto rounded-full bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <AlertTriangle className="w-7 h-7" />
            </div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
              خطایی در نمایش رخ داد (لغاتت کاملاً امن هستند)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 dir-ltr break-words bg-slate-50 dark:bg-slate-800 p-3 rounded-xl">
              {this.state.errorMessage}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full inline-flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-900 dark:bg-blue-600 text-white font-bold text-sm"
            >
              <RefreshCw className="w-4 h-4" />
              بارگذاری مجدد برنامه
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
