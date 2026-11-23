import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { User } from '@supabase/supabase-js';
import { db, healDatabaseFromMirrorIfEmpty } from './db/database';
import { NotebookEntry, TabId, ToastMessage } from './types';
import { useSettings } from './hooks/useSettings';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { isEntryDue } from './lib/fsrs';
import { getCloudUser, syncWithSupabase } from './lib/sync';
import { syncWithGoogleSheets } from './lib/sheetsSync';
import { Navigation } from './components/Navigation';
import { Toast } from './components/Toast';
import { AddEditView } from './components/AddEditView';
import { LibraryView } from './components/LibraryView';
import { ReviewView } from './components/ReviewView';
import { StatsView } from './components/StatsView';
import { SettingsView } from './components/SettingsView';

export default function App() {
  const { settings, updateSettings } = useSettings();
  const online = useOnlineStatus();

  const [activeTab, setActiveTab] = useState<TabId>('add');
  const [editingEntry, setEditingEntry] = useState<NotebookEntry | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [syncing, setSyncing] = useState(false);

  const toastTimerRef = useRef<number | null>(null);
  const autoSyncTimerRef = useRef<number | null>(null);
  const syncingRef = useRef(false);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const notify = useCallback((type: 'ok' | 'err' | 'info', text: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), type, text });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4000);
  }, []);

  // خودترمیمی اضطراری حافظه محلی در صورت پاک شدن تصادفی IndexedDB توسط مرورگر موبایل
  useEffect(() => {
    void healDatabaseFromMirrorIfEmpty();
  }, []);

  const allActiveEntries =
    useLiveQuery(
      () => db.entries.filter((e) => !e.deletedAt).toArray(),
      [],
      [] as NotebookEntry[]
    ) || [];

  const pendingCount =
    useLiveQuery(
      () => db.entries.where('syncStatus').equals('pending').count(),
      [],
      0
    ) || 0;

  const reviewLogs = useLiveQuery(() => db.reviewLogs.toArray(), [], []) || [];

  const sessions = useMemo(() => {
    const set = new Set<string>();
    for (const e of allActiveEntries) {
      if (e.session) set.add(e.session);
    }
    return Array.from(set).sort();
  }, [allActiveEntries]);

  const dueCount = useMemo(() => {
    const nowMs = Date.now();
    return allActiveEntries.filter((e) => isEntryDue(e, nowMs)).length;
  }, [allActiveEntries]);

  // بررسی نشست محلی Supabase (۰ میلی‌ثانیه بدون درخواست شبکه)
  useEffect(() => {
    let active = true;
    if (settings.syncProvider !== 'supabase') {
      setCloudUser(null);
      return;
    }
    void getCloudUser(settings.supabaseUrl, settings.supabaseAnonKey)
      .then((u) => {
        if (active) setCloudUser(u);
      })
      .catch(() => {
        if (active) setCloudUser(null);
      });
    return () => {
      active = false;
    };
  }, [settings.syncProvider, settings.supabaseUrl, settings.supabaseAnonKey]);

  const sheetsConnected =
    settings.syncProvider === 'sheets' &&
    settings.sheetsWebAppUrl.trim().startsWith('https://script.google.com/') &&
    settings.sheetsSecretPin.trim().length > 0;

  const cloudConnected =
    sheetsConnected || (settings.syncProvider === 'supabase' && Boolean(cloudUser));

  const runSync = useCallback(
    async (silent = false) => {
      if (syncingRef.current || !online || !cloudConnected) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const cur = settingsRef.current;
        const report =
          cur.syncProvider === 'sheets'
            ? await syncWithGoogleSheets({
                webAppUrl: cur.sheetsWebAppUrl,
                secretPin: cur.sheetsSecretPin
              })
            : await syncWithSupabase({
                supabaseUrl: cur.supabaseUrl,
                supabaseAnonKey: cur.supabaseAnonKey
              });

        updateSettings({ lastSyncedAt: report.syncedAt });
        if (!silent) {
          notify('ok', 'همگام‌سازی با موفقیت انجام شد.');
        }
      } catch (err) {
        if (!silent) {
          notify('err', err instanceof Error ? err.message : 'خطا در همگام‌سازی');
        }
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [online, cloudConnected, updateSettings, notify]
  );

  // همگام‌سازی خودکار هنگام باز کردن برنامه و هنگام بازگشت از پس‌زمینه گوشی
  useEffect(() => {
    if (online && cloudConnected) {
      void runSync(true);
    }
  }, [online, cloudConnected, runSync]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && online && cloudConnected) {
        void runSync(true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [online, cloudConnected, runSync]);

  const scheduleBackgroundSync = useCallback(() => {
    if (!online || !cloudConnected) return;
    if (autoSyncTimerRef.current) window.clearTimeout(autoSyncTimerRef.current);
    autoSyncTimerRef.current = window.setTimeout(() => {
      void runSync(true);
    }, 2000);
  }, [online, cloudConnected, runSync]);

  const handleStartEdit = (entry: NotebookEntry) => {
    setEditingEntry(entry);
    setActiveTab('add');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      <Navigation
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        dueCount={dueCount}
        pendingCount={pendingCount}
        online={online}
        darkMode={settings.darkMode}
        onToggleDark={() => updateSettings({ darkMode: !settings.darkMode })}
        accent={settings.accent}
        onChangeAccent={(acc) => updateSettings({ accent: acc })}
        cloudConnected={cloudConnected}
        syncing={syncing}
        onSyncNow={() => void runSync(false)}
      />

      <main className="lg:pr-64 pb-24 lg:pb-10">
        <div className="max-w-3xl mx-auto px-3.5 sm:px-6 pt-4 sm:pt-6">
          {activeTab === 'add' && (
            <AddEditView
              entries={allActiveEntries}
              sessions={sessions}
              settings={settings}
              editingEntry={editingEntry}
              onClearEditing={() => setEditingEntry(null)}
              onStartEdit={handleStartEdit}
              onUpdateSettings={updateSettings}
              onNotify={notify}
              onDataMutated={scheduleBackgroundSync}
            />
          )}

          {activeTab === 'library' && (
            <LibraryView
              entries={allActiveEntries}
              sessions={sessions}
              settings={settings}
              onStartEdit={handleStartEdit}
              onNotify={notify}
              onDataMutated={scheduleBackgroundSync}
            />
          )}

          {activeTab === 'review' && (
            <ReviewView
              entries={allActiveEntries}
              sessions={sessions}
              settings={settings}
              onNotify={notify}
              onDataMutated={scheduleBackgroundSync}
            />
          )}

          {activeTab === 'stats' && (
            <StatsView entries={allActiveEntries} reviewLogs={reviewLogs} />
          )}

          {activeTab === 'settings' && (
            <SettingsView
              settings={settings}
              onUpdateSettings={updateSettings}
              cloudUser={cloudUser}
              onCloudUserChange={setCloudUser}
              pendingCount={pendingCount}
              syncing={syncing}
              onSyncNow={() => void runSync(false)}
              onNotify={notify}
              onDataMutated={scheduleBackgroundSync}
            />
          )}
        </div>
      </main>

      <Toast toast={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
