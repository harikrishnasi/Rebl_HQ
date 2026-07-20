-- ============================================================
-- REBL HQ v3.2 — run once in the Supabase SQL editor (after v3_1).
-- Adds: notes (a modern notes surface — pin, color, category, labels).
-- ============================================================

create table notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,  -- company tag (Rebl/Orbit)
  title text,
  body text,                                    -- markdown
  category text,                                -- freeform, user-defined
  labels text[] not null default '{}',          -- note-level labels/keywords
  color text not null default 'default'
    check (color in ('default','amber','rose','sage','sky','violet','slate')),
  pinned boolean not null default false,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger (set_updated_at() defined in migration.sql)
create trigger notes_updated_at
  before update on notes
  for each row execute function set_updated_at();

-- RLS: enable + owner-only, written out in full.
alter table notes enable row level security;
create policy "notes select own" on notes for select to authenticated using (user_id = auth.uid());
create policy "notes insert own" on notes for insert to authenticated with check (user_id = auth.uid());
create policy "notes update own" on notes for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes delete own" on notes for delete to authenticated using (user_id = auth.uid());
