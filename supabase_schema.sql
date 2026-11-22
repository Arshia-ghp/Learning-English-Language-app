-- ============================================================================
-- اسکیمای دیتابیس ابری دفترچه زبان LexiFlow برای Supabase (PostgreSQL)
-- این کد را در بخش SQL Editor پنل Supabase کپی و یک بار Run کنید.
-- ============================================================================

-- ۱. جدول اصلی یادداشت‌ها و وضعیت الگوریتم مرور FSRS
create table if not exists public.notebook_entries (
  user_id uuid not null default auth.uid(),
  id text not null,
  category text not null,
  session text not null default '',
  english text not null,
  persian text not null,
  meta text not null default '',
  example text not null default '',
  notes text not null default '',
  tags jsonb not null default '[]'::jsonb,
  favorite boolean not null default false,

  -- وضعیت الگوریتم FSRS-5
  state integer not null default 0,
  stability double precision not null default 0,
  difficulty double precision not null default 0,
  reps integer not null default 0,
  lapses integer not null default 0,
  elapsed_days double precision not null default 0,
  scheduled_days double precision not null default 0,
  last_review timestamptz null,
  due timestamptz not null default now(),

  -- متادیتای همگام‌سازی (Last-Write-Wins + Soft Delete)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz null,

  primary key (user_id, id)
);

-- ۲. جدول تاریخچه مرورها (برای زنجیره روزانه و نقشه حرارتی مطالعه)
create table if not exists public.notebook_review_logs (
  user_id uuid not null default auth.uid(),
  id text not null,
  entry_id text not null,
  rating integer not null,
  reviewed_at timestamptz not null default now(),
  day_key text not null,

  primary key (user_id, id)
);

-- ایندکس‌های سرعت بالا برای همگام‌سازی تفاضلی
create index if not exists idx_nb_entries_user_updated
  on public.notebook_entries (user_id, updated_at desc);

create index if not exists idx_nb_logs_user_day
  on public.notebook_review_logs (user_id, day_key desc);

-- فعال‌سازی امنیت سطح سطر (Row Level Security)
-- با این تنظیم، هیچ کاربر دیگری به یادداشت‌های شما دسترسی نخواهد داشت.
alter table public.notebook_entries enable row level security;
alter table public.notebook_review_logs enable row level security;

-- سیاست‌های دسترسی امن برای جدول یادداشت‌ها
drop policy if exists "Users manage own entries" on public.notebook_entries;
create policy "Users manage own entries"
  on public.notebook_entries
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- سیاست‌های دسترسی امن برای جدول تاریخچه مرور
drop policy if exists "Users manage own review logs" on public.notebook_review_logs;
create policy "Users manage own review logs"
  on public.notebook_review_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
