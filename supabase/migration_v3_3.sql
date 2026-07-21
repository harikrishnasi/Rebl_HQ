-- ============================================================
-- REBL HQ v3.3 — run once in the Supabase SQL editor (after v3_2).
-- Adds: websites (live/down status + domain renewal countdown).
-- Idempotent: safe to re-run.
-- ============================================================

create table if not exists websites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,  -- company tag (Rebl/Orbit)
  name text not null,                                   -- getrebl.com
  url text,                                             -- https://getrebl.com
  status text not null default 'live'
    check (status in ('live','down','building','paused')),
  provider text,                                        -- Vercel, Netlify, GoDaddy...
  renewal_on date,                                      -- domain/hosting renewal date
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger (set_updated_at() defined in migration.sql)
create or replace trigger websites_updated_at
  before update on websites
  for each row execute function set_updated_at();

-- RLS: enable + owner-only. Drop-then-create so re-running is safe.
alter table websites enable row level security;
drop policy if exists "websites select own" on websites;
create policy "websites select own" on websites for select to authenticated using (user_id = auth.uid());
drop policy if exists "websites insert own" on websites;
create policy "websites insert own" on websites for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "websites update own" on websites;
create policy "websites update own" on websites for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "websites delete own" on websites;
create policy "websites delete own" on websites for delete to authenticated using (user_id = auth.uid());
