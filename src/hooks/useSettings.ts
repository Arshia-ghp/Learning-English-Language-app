import { useEffect, useState, useCallback } from 'react';
import { AppSettings } from '../types';
import { THEMES } from '../config/categories';

const STORAGE_KEY = 'lexiflow_settings_v1';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'navy',
  darkMode: false,
  accent: 'en-US',
  keepSession: true,
  lastSession: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  geminiApiKey: '',
  lastSyncedAt: null
};

function loadInitialSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadInitialSettings);

  const updateSettings = useCallback((patch: Partial<AppSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage quota errors
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    const t = THEMES[settings.theme] || THEMES.navy;
    root.style.setProperty('--brand-rgb', t.brandRgb);
    root.style.setProperty('--brand-soft-rgb', settings.darkMode ? '30 58 138' : t.softRgb);
    root.style.setProperty('--brand-hover-rgb', t.hoverRgb);

    if (settings.darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
      metaTheme.setAttribute('content', settings.darkMode ? '#0f172a' : t.brand);
    }
  }, [settings.theme, settings.darkMode]);

  return { settings, updateSettings };
}
