# BUILD PROMPT — REBL HQ v3 (Supabase-backed founder dashboard)
### Supersedes all prior Rebl HQ prompts. Paste whole into Claude Code. Self-contained.

You are upgrading **Rebl HQ** — a private, single-user company operating dashboard for a one-person startup. The current app is a client-side SPA persisting to localStorage with sections: Leads, Tasks, Expenses, Documents, Design Journal. You will migrate it to **Supabase** (Postgres + Auth + Storage) and rebuild five areas to the specs below. Preserve the existing design system exactly. Do not add anything outside this spec.

---

## 0. Hard rules

- **Single user.** One account, Supabase Auth email+password. No signup UI — the account is created once in the Supabase dashboard. No roles, no sharing, no multi-tenancy.
- **RLS default-deny on every table.** Every table has `user_id uuid not null default auth.uid()`. Policies: `user_id = auth.uid()` for select/insert/update/delete. No anon access anywhere. Never fix a permission error by widening access.
- **No custom backend.** Supabase JS client from the browser only. No Edge Functions, no server.
- **No new dependencies beyond:** `@supabase/supabase-js`, one markdown renderer (`marked` or `react-markdown` + `remark-gfm`), one sanitizer (`dompurify`). No charts library, no UI kit, no state library.
- **Keep the current design system untouched:** warm monochrome + brass accent, Big Shoulders for display headings (uppercase), Satoshi for body, wide-tracked uppercase Satoshi for labels/buttons. Reuse existing tokens/classes. New pages must be indistinguishable in style from existing ones.
- Environment: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` from `.env.local` (gitignored). Fail loudly with a readable message if missing.

---

## 1. Supabase setup (generate these as files in `/supabase/`)

### 1.1 `migration.sql` — run once in the SQL editor

```sql
-- TAGS (company/context tag — one per record, applied everywhere)
create table tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  unique (user_id, name)
);
-- Seed two rows on first login if table is empty: 'Rebl', 'Orbit'.

-- LEADS (fixed columns, migrated from current tracker)
create table leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  tag_id uuid references tags(id) on delete set null,
  name text not null,
  stage text not null default 'Shortlist',
    -- allowed: Shortlist, Reached out, Replied, Meeting, Follow up, Signed, Passed
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
  recurrence text not null default 'once',
    -- allowed: once, daily, weekly, monthly, custom
  due_date date,                -- for 'once'
  interval_days int,            -- for 'custom' (every N days)
  anchor_date date not null default current_date, -- recurrence anchor
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
-- Note: the tag lives on the DOCUMENT, not on versions — all versions inherit it.

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

-- RLS: enable + default-deny + owner-only on ALL tables above
-- (write the full alter table ... enable row level security; and four policies per table, explicitly, no shortcuts)
```

Write every RLS statement out in full in the migration file. Also add an `updated_at` trigger for `leads`.

### 1.2 Storage

- Private bucket `hq-docs`. No public access.
- Storage RLS: authenticated user can read/write only paths prefixed with their own `auth.uid()`. Upload path convention: `{uid}/{document_id}/{version_no}/{original_filename}`.
- All reads via `createSignedUrl` (60-minute expiry), generated on demand when a version is opened.
- Accepted uploads: `.md`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.txt`. Max 25 MB. Reject anything else with a visible message.

### 1.3 One-time migration from localStorage

- Keep the existing **Import** button. Extend it: importing the current app's export JSON writes rows into Supabase (leads → `leads`, tasks → `tasks` as `once`, expenses → `transactions` as `expense` with an "Uncategorized" category, documents → one `documents` row + one `document_versions` markdown v1 each, journal → `journal_entries` with body in `designed`).
- **Export** now dumps all Supabase tables to one JSON file (excluding storage binaries; include file metadata + storage paths).

---

## 2. HOME (new — the missing general dashboard)

Route `/`. This is the landing page after login. One glanceable screen, no scrolling on a laptop if possible. Layout top to bottom:

1. **Header row:** "REBL HQ" eyebrow, big display date ("SATURDAY · JULY 19"), and a single editable mission line stored in a `settings` key-value table or a one-row table (create it: `settings(user_id, key, value)` with RLS).
2. **Metrics row — four tiles:**
   - **Pipeline**: total leads, with per-stage mini-count underneath (e.g. "Reached out 4 · Replied 1 · Meeting 0").
   - **Outreach this week**: count of leads whose `reach_out_on` falls in the current ISO week. This is the number that matters most; give it the brass accent.
   - **Tasks today**: due-today count (see §3 logic), completed/total.
   - **This month**: income − expense = net, formatted ₹.
3. **Two-column body:**
   - Left: **Today's tasks** (the same computed "Today" list from §3, checkable inline from Home).
   - Right: **Latest journal entry** (title + date + first ~40 words, click through) and **Follow-ups due** (leads with `follow_up_on` ≤ today+2, sorted ascending).
4. Every tile/list item links into its section.

No charts. Numbers and lists only.

---

## 3. TASKS (rebuild)

Views (tabs or stacked groups, match existing style): **Today · Weekly · Monthly · Custom · Completed**.

**Model:** a task has `recurrence`:
- `once` — appears under Today when `due_date` ≤ today; under its date otherwise.
- `daily` — due every day.
- `weekly` — due once per ISO week (anchored to `anchor_date`'s weekday).
- `monthly` — due once per calendar month (anchored to `anchor_date`'s day-of-month; clamp to month end).
- `custom` — due every `interval_days` days from `anchor_date`.

**Due/done logic (compute client-side, no cron):**
- A recurring task is "due today" if today matches its schedule AND no `task_completions` row exists for the current period (day / ISO week / month / N-day window).
- Checking a task inserts a completion for today; unchecking (same period only) deletes it.
- Recurring tasks therefore reappear automatically next period. Completions accumulate as history.

**UI:**
- Add bar: title input + recurrence select (Once/Daily/Weekly/Monthly/Every N days) + date input shown contextually (due date for Once, N for custom).
- **Today** shows everything due today across all recurrences — this is the working view.
- **Weekly / Monthly / Custom** tabs list tasks of that recurrence with their next-due date and a small streak count (consecutive periods completed).
- **Completed** is a collapsible reverse-chronological log of completions (date · task title), plus archived one-off tasks.
- Archive (not delete) for recurring tasks; delete allowed for `once`.

Seed nothing. Migrated tasks arrive as `once`.

---

## 4. FINANCE (rebuild of Expenses)

Rename section to **Finance**. Three zones on one page:

1. **Month header:** month switcher (‹ July 2026 ›). Summary tiles: **Income · Expense · Net** for the selected month, ₹ formatted, net in brass when positive / muted red when negative.
2. **Add transaction** inline row: date (default today) · Income/Expense toggle · category select (+ "New category…" inline creation with kind inherited from the toggle) · amount · method select (UPI/Card/Cash/Bank/Other) · note · Add.
3. **Body, two columns:**
   - Left (wider): **transactions table** for the selected month, newest first: date, category, note, method, amount (signed, expense negative). Row actions: edit inline, delete with confirm. Filters above the table: category multi-select, kind toggle, text search on note.
   - Right: **category breakdown** for the month — per-category totals as rows with a simple CSS proportion bar (no chart lib), expenses and income grouped separately; below it, a **last-6-months mini table**: month · income · expense · net.
4. **Manage categories** behind the existing MANAGE button pattern: rename, delete (transactions keep rows, category becomes null → shown as "Uncategorized").

---

## 5. DOCUMENTS (rebuild — versioned, natively viewable)

**List view** (route `/documents`): one row per **document** (not per file): title · latest version number ("v4") · latest version date · kind icon (md/pdf/img). "+ NEW DOCUMENT" asks title + first version (see upload flow). Delete document = confirm modal warning it removes all versions (storage objects included).

**Document view** (route `/documents/:id`) — the core of this rebuild:

- **Main pane (left, ~75%): the latest version rendered natively.**
  - `markdown` → render with the markdown renderer + GFM (tables, task lists), sanitized with DOMPurify, styled with the existing type system (Big Shoulders headings, Satoshi body). Must look like a designed page, not raw text.
  - `pdf` → `<iframe>` with the signed URL, full pane height.
  - image → `<img>` with the signed URL, fit-to-width.
  - `.txt` → monospace-styled pre block.
- **Version sidebar (right, ~25%):** the full version stack, newest first: `v4 · 2026-07-19 · note`. The open version is highlighted. **Clicking any older version loads it into the main pane** with a subtle "VIEWING v2 — NOT LATEST" banner and a "BACK TO LATEST" link. Nothing is ever overwritten or deleted from the stack (no per-version delete in v3).
- **Header actions:** "UPLOAD NEW VERSION" (file picker or "write markdown" choice → creates `version_no = max+1`, optional one-line note), "DOWNLOAD" (signed URL of the open version), rename title.
- **Editing:** markdown versions get an EDIT toggle → textarea with the source → SAVE creates a **new version** (never mutates the old one). This is the whole versioning philosophy: append-only, like git.

---

## 6. JOURNAL (rebuild of Design Journal)

Rename to **Journal**. One entry per working session, matching the internal decision-journal format.

- "+ NEW ENTRY" opens an inline form: date (default today) · title · three markdown fields with fixed labels — **DESIGNED / DECIDED**, **REJECTED**, **WHY**.
- List: newest first. Each entry renders as: date + title header row, then the three sections rendered as markdown with small wide-tracked uppercase labels. Empty sections are hidden.
- EDIT edits in place (journal entries are working notes, not versioned documents). Delete with confirm.
- Keep it fast: the whole point is a 90-second end-of-session ritual.

---

## 7. LEADS (migrate only)

Keep current behavior and columns exactly (Name, Stage, Contact, Segment, Reach out on, Follow up on, Notes; stage filter chips with counts; filter box), backed by the `leads` table instead of localStorage. Inline editing persists on blur. No feature changes.

---

## 8. TAGS (global company/context filter)

Every record in Leads, Tasks, Finance, Documents, and Journal carries **exactly one optional tag** (`tag_id`). Tags answer "which company is this for" — seeded with **Rebl** and **Orbit**, user can create more.

**Assigning:**
- Every create/edit form gets a compact tag select (REBL / ORBIT / — / + new…), styled as a small wide-tracked uppercase chip select. Defaults to the currently active global filter (see below) if one is set, else none.
- Tables/lists show the tag as a small chip on each row (muted; brass outline on hover). Untagged rows show nothing.
- Tag management (rename, delete, add) lives behind the existing MANAGE pattern in the shell. Deleting a tag sets records to untagged — never deletes records.

**Global filter — the important part:**
- A persistent filter control in the top of the sidebar, above the section list: **ALL · REBL · ORBIT · (+ any custom)** as chips. Exactly one active at a time; ALL is default.
- The active filter scopes **everything**: Home metrics and lists, Leads table and stage counts, Tasks (all views, due-today logic, sidebar counts), Finance (summaries, table, breakdown, 6-month table), Documents list, Journal list.
- Untagged records appear only under ALL.
- Selection persists across reloads (localStorage is fine for this one preference).
- When a filter is active, show a subtle "FILTERED · ORBIT" indicator next to each page's display heading so a scoped view is never mistaken for the whole picture.

One tag per record is deliberate. Do not implement multi-tag, tag colors beyond the default chip style, or tag hierarchies.

## 9. Auth & shell

- Unauthenticated → minimal login screen in the design system (email + password, brass submit). No signup, no magic link, no reset flow in-app (reset via Supabase dashboard).
- Sidebar: **Home · Leads · Tasks · Finance · Documents · Journal**, counts beside each (leads total, tasks due today, current-month transactions, documents, entries). Remove "+ NEW SECTION" (sections are now fixed — the flexible-section system is retired). Keep EXPORT / IMPORT / LOG OUT at the bottom. Replace "SAVED · time" with a small sync indicator (✓ synced / spinner on in-flight writes / red on error with retry).
- Optimistic UI on all writes; on failure, revert and show a toast.

---

## 10. Permanently out of scope

Charts libraries, multi-user/sharing, notifications/emails, mobile app, integrations (Notion, Sheets, banks), AI features, multi-tag / tag colors / tag hierarchies, comments, public pages, Edge Functions, dark/light toggle (it is dark), drag-and-drop reordering, per-version deletion, full-text search. Do not add any of these even if trivial.

## 11. Definition of done

- Fresh clone + `.env.local` + migration.sql + bucket = working app.
- Manual click-through checklist passes: login → Home shows real numbers → add daily task, check it, confirm it's in Completed and reappears logic-wise tomorrow (simulate by inserting a completion for yesterday) → add income + expense, month summary updates → create document with markdown v1, upload PDF as v2, main pane shows PDF, sidebar shows v1 clickable, edit-save markdown creates v3 → new journal entry renders three sections → lead stage edit persists after reload → tag one lead ORBIT and one task REBL, switch the global filter to ORBIT, confirm the task disappears, Home metrics shrink, and the "FILTERED · ORBIT" indicator shows → switch back to ALL, everything returns.
- No console errors, no RLS bypasses, anon key holds zero data access when logged out (verify by calling a select while signed out — must return empty/denied).
