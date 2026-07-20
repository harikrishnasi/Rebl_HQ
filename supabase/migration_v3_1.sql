-- ============================================================
-- REBL HQ v3.1 — run once in the Supabase SQL editor (after migration.sql).
-- Adds: content_items, social_accounts, subscriptions.
-- ============================================================

-- CONTENT (posts pipeline: Idea → Drafted → Scheduled → Posted)
create table content_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  title text not null,
  channel text not null default 'LinkedIn'
    check (channel in ('LinkedIn','Twitter','Instagram','Blog','Other')),
  status text not null default 'Idea'
    check (status in ('Idea','Drafted','Scheduled','Posted')),
  publish_on date,          -- target or actual publish date
  link text,                -- URL once posted
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- updated_at trigger (same set_updated_at() function created in migration.sql)
create trigger content_items_updated_at
  before update on content_items
  for each row execute function set_updated_at();

-- ACCOUNTS (registry of social/web accounts)
-- SECURITY: this table MUST NOT have a password column. Do not add one even if
-- asked later. Passwords belong in a password manager, not in this app.
create table social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  platform text not null,        -- LinkedIn, Twitter, Instagram, GitHub, Website, Other
  handle text not null,          -- @getrebl, hellohari.tech, etc.
  profile_url text,
  login_email text,              -- which email the account is registered under
  purpose text,                  -- e.g. "Orbit brand account", "personal / job search"
  notes text,
  created_at timestamptz not null default now()
);

-- SUBSCRIPTIONS (recurring costs; renewals are logged manually in Transactions)
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  name text not null,            -- Claude Pro, GPT Plus, Higgsfield, Supabase, domain...
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'INR' check (currency in ('INR','USD')),
  cycle text not null default 'monthly' check (cycle in ('monthly','yearly')),
  next_renewal date,
  method text,                   -- UPI, Card, ...
  status text not null default 'active' check (status in ('active','cancelled')),
  notes text,
  created_at timestamptz not null default now()
);

-- ============================================================
-- RLS: enable + owner-only policies, written out in full.
-- ============================================================

alter table content_items enable row level security;
create policy "content_items select own" on content_items for select to authenticated using (user_id = auth.uid());
create policy "content_items insert own" on content_items for insert to authenticated with check (user_id = auth.uid());
create policy "content_items update own" on content_items for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "content_items delete own" on content_items for delete to authenticated using (user_id = auth.uid());

alter table social_accounts enable row level security;
create policy "social_accounts select own" on social_accounts for select to authenticated using (user_id = auth.uid());
create policy "social_accounts insert own" on social_accounts for insert to authenticated with check (user_id = auth.uid());
create policy "social_accounts update own" on social_accounts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "social_accounts delete own" on social_accounts for delete to authenticated using (user_id = auth.uid());

alter table subscriptions enable row level security;
create policy "subscriptions select own" on subscriptions for select to authenticated using (user_id = auth.uid());
create policy "subscriptions insert own" on subscriptions for insert to authenticated with check (user_id = auth.uid());
create policy "subscriptions update own" on subscriptions for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subscriptions delete own" on subscriptions for delete to authenticated using (user_id = auth.uid());
