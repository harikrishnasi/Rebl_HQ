-- ============================================================
-- REBL HQ v3 — run once in the Supabase SQL editor.
-- Single-user app: every table is owner-only via RLS (default deny).
-- ============================================================

-- TAGS (company/context tag — one per record, applied everywhere)
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  unique (user_id, name)
);
-- 'Rebl' and 'Orbit' are seeded by the app on first login if the table is empty.

-- LEADS (fixed columns, migrated from the v2 tracker)
create table leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  name text not null,
  stage text not null default 'Shortlist'
    check (stage in ('Shortlist','Reached out','Replied','Meeting','Follow up','Signed','Passed')),
  contact text,
  segment text,
  reach_out_on date,
  follow_up_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- TASKS
create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  title text not null,
  recurrence text not null default 'once'
    check (recurrence in ('once','daily','weekly','monthly','custom')),
  due_date date,                                   -- for 'once'
  interval_days int,                               -- for 'custom' (every N days)
  anchor_date date not null default current_date,  -- recurrence anchor
  archived boolean not null default false,
  created_at timestamptz not null default now()
);

create table task_completions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  task_id uuid not null references tasks(id) on delete cascade,
  completed_on date not null default current_date,
  unique (task_id, completed_on)
);

-- FINANCE
create table finance_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  kind text not null check (kind in ('income','expense')),
  unique (user_id, name, kind)
);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  occurred_on date not null default current_date,
  kind text not null check (kind in ('income','expense')),
  category_id uuid references finance_categories(id) on delete set null,
  amount numeric(12,2) not null check (amount > 0),
  method text,     -- UPI, card, cash, bank, other
  note text,
  created_at timestamptz not null default now()
);

-- DOCUMENTS (document = entity; versions = append-only stack)
create table documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  title text not null,
  created_at timestamptz not null default now()
);
-- The tag lives on the DOCUMENT, not on versions — all versions inherit it.

create table document_versions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  document_id uuid not null references documents(id) on delete cascade,
  version_no int not null,
  kind text not null check (kind in ('markdown','file')),
  content text,          -- markdown source when kind='markdown'
  file_path text,        -- storage path when kind='file'
  mime_type text,
  note text,             -- optional "what changed" line
  created_at timestamptz not null default now(),
  unique (document_id, version_no)
);

-- JOURNAL (one entry per working session)
create table journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  entry_date date not null default current_date,
  title text not null,
  designed text,   -- markdown: what I designed / decided
  rejected text,   -- markdown: what I rejected
  why text,        -- markdown: why
  created_at timestamptz not null default now()
);

-- SETTINGS (key-value; mission line lives here)
create table settings (
  user_id uuid not null default auth.uid(),
  key text not null,
  value text,
  primary key (user_id, key)
);

-- ============================================================
-- updated_at trigger for leads
-- ============================================================
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

create trigger leads_updated_at
  before update on leads
  for each row execute function set_updated_at();

-- ============================================================
-- RLS: enable + owner-only policies on every table. Default deny:
-- enabling RLS with no matching policy denies everything, including anon.
-- ============================================================

alter table tags enable row level security;
create policy "tags select own" on tags for select to authenticated using (user_id = auth.uid());
create policy "tags insert own" on tags for insert to authenticated with check (user_id = auth.uid());
create policy "tags update own" on tags for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tags delete own" on tags for delete to authenticated using (user_id = auth.uid());

alter table leads enable row level security;
create policy "leads select own" on leads for select to authenticated using (user_id = auth.uid());
create policy "leads insert own" on leads for insert to authenticated with check (user_id = auth.uid());
create policy "leads update own" on leads for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "leads delete own" on leads for delete to authenticated using (user_id = auth.uid());

alter table tasks enable row level security;
create policy "tasks select own" on tasks for select to authenticated using (user_id = auth.uid());
create policy "tasks insert own" on tasks for insert to authenticated with check (user_id = auth.uid());
create policy "tasks update own" on tasks for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks delete own" on tasks for delete to authenticated using (user_id = auth.uid());

alter table task_completions enable row level security;
create policy "task_completions select own" on task_completions for select to authenticated using (user_id = auth.uid());
create policy "task_completions insert own" on task_completions for insert to authenticated with check (user_id = auth.uid());
create policy "task_completions update own" on task_completions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "task_completions delete own" on task_completions for delete to authenticated using (user_id = auth.uid());

alter table finance_categories enable row level security;
create policy "finance_categories select own" on finance_categories for select to authenticated using (user_id = auth.uid());
create policy "finance_categories insert own" on finance_categories for insert to authenticated with check (user_id = auth.uid());
create policy "finance_categories update own" on finance_categories for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "finance_categories delete own" on finance_categories for delete to authenticated using (user_id = auth.uid());

alter table transactions enable row level security;
create policy "transactions select own" on transactions for select to authenticated using (user_id = auth.uid());
create policy "transactions insert own" on transactions for insert to authenticated with check (user_id = auth.uid());
create policy "transactions update own" on transactions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "transactions delete own" on transactions for delete to authenticated using (user_id = auth.uid());

alter table documents enable row level security;
create policy "documents select own" on documents for select to authenticated using (user_id = auth.uid());
create policy "documents insert own" on documents for insert to authenticated with check (user_id = auth.uid());
create policy "documents update own" on documents for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "documents delete own" on documents for delete to authenticated using (user_id = auth.uid());

alter table document_versions enable row level security;
create policy "document_versions select own" on document_versions for select to authenticated using (user_id = auth.uid());
create policy "document_versions insert own" on document_versions for insert to authenticated with check (user_id = auth.uid());
create policy "document_versions update own" on document_versions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "document_versions delete own" on document_versions for delete to authenticated using (user_id = auth.uid());

alter table journal_entries enable row level security;
create policy "journal_entries select own" on journal_entries for select to authenticated using (user_id = auth.uid());
create policy "journal_entries insert own" on journal_entries for insert to authenticated with check (user_id = auth.uid());
create policy "journal_entries update own" on journal_entries for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "journal_entries delete own" on journal_entries for delete to authenticated using (user_id = auth.uid());

alter table settings enable row level security;
create policy "settings select own" on settings for select to authenticated using (user_id = auth.uid());
create policy "settings insert own" on settings for insert to authenticated with check (user_id = auth.uid());
create policy "settings update own" on settings for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "settings delete own" on settings for delete to authenticated using (user_id = auth.uid());

-- ============================================================
-- STORAGE: private bucket + owner-only path policies.
-- Upload path convention: {uid}/{document_id}/{version_no}/{filename}
-- ============================================================

insert into storage.buckets (id, name, public)
values ('hq-docs', 'hq-docs', false)
on conflict (id) do nothing;

create policy "hq-docs read own" on storage.objects for select to authenticated
  using (bucket_id = 'hq-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hq-docs insert own" on storage.objects for insert to authenticated
  with check (bucket_id = 'hq-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hq-docs update own" on storage.objects for update to authenticated
  using (bucket_id = 'hq-docs' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'hq-docs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "hq-docs delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'hq-docs' and (storage.foldername(name))[1] = auth.uid()::text);
