# REBL HQ v3.1

Private founder dashboard for a one-person company. One Supabase login, eight
fixed sections, everything edited directly in the app:

| Section | What it does |
| --- | --- |
| **Home** | Glanceable landing page: date + editable mission line, four metric tiles (pipeline, outreach this week, tasks today, month net ₹), today's tasks (checkable), latest journal entry, follow-ups due |
| **Leads** | Pipeline table — name, stage, contact, segment, reach-out/follow-up dates, notes. Stage filter chips with counts, inline editing |
| **Content** | Posts pipeline: Idea → Drafted → Scheduled → Posted. Channel + status filters, publish dates, links |
| **Tasks** | Recurring tasks: once / daily / weekly / monthly / every-N-days. Today view computes what's due; completions are history; streaks per recurring task |
| **Finance** | Two tabs. *Transactions*: income + expenses by month with summary tiles, category breakdown bars, last-6-months table. *Subscriptions*: recurring costs (₹/$, monthly/yearly), recurring-per-month total, renewal dates. Renewals are logged manually as transactions |
| **Documents** | Append-only versioned documents. Markdown renders natively; PDF/image/txt uploads viewable in-app; version stack in a sidebar; editing a markdown doc creates a new version — nothing is ever overwritten |
| **Journal** | One entry per working session: Designed/Decided · Rejected · Why, all markdown |
| **Accounts** | Registry of social/web accounts: platform, handle, profile URL, login email, purpose. **Never passwords** — those live in your password manager |

**Tags** (Rebl / Orbit / your own) mark which company a record belongs to. The
global filter at the top of the sidebar scopes *everything* — Home metrics,
tables, counts — and shows a "Filtered · X" indicator on every page. Untagged
records appear only under All.

Backend: **Supabase** (Postgres + Auth + Storage), accessed straight from the
browser. Owner-only row-level security on every table; no server of our own.

## One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL editor** → paste and run the whole of [supabase/migration.sql](supabase/migration.sql),
   then [supabase/migration_v3_1.sql](supabase/migration_v3_1.sql). This creates all
   tables, RLS policies, the `hq-docs` private storage bucket and its policies.
3. **Authentication → Users → Add user**: create your single account
   (email + password, "Auto confirm user"). There is no signup in the app,
   ever. Password resets also happen here.
4. **Project settings → API**: copy the *Project URL* and the *anon public* key.
5. In this folder: copy `.env.local.example` to `.env.local` and fill both
   values in. `.env.local` is gitignored.

## Run locally

```sh
npm install
npm run dev        # vite — opens on http://localhost:5173
```

If the app says "Supabase is not configured", `.env.local` is missing or empty.

## Deploy (Netlify)

```sh
npx netlify login
npx netlify link                       # or: netlify init
npx netlify env:set VITE_SUPABASE_URL "https://YOUR-PROJECT.supabase.co"
npx netlify env:set VITE_SUPABASE_ANON_KEY "YOUR-ANON-KEY"
npm run deploy                         # builds with vite, publishes dist/
```

The anon key is safe to ship to the browser — RLS is what protects the data.
Verify: sign out and try a select with the anon key; it must return nothing.

## Backup / Import / Export

- **Backup** (sidebar) has two layers:
  - **Download full backup (.zip)** — one zip with `data.json` (every table)
    *plus every uploaded document file*, fetched from storage. This is the
    complete offline copy.
  - **Supabase snapshots** — the JSON dump saved into the private `hq-docs`
    bucket under `{uid}/backups/`. One is taken **automatically once a day**
    when you open the app; the last 14 are kept and listed in the Backup modal
    with download links. Restore any snapshot via **Import**.
- **Export** dumps every table to one JSON file (no binaries — file versions
  keep their metadata and storage path).
- **Import** accepts a v3 dump / snapshot (rows are added, existing ids
  skipped) or the old v2 localStorage-app export, which is migrated: leads →
  `leads`, tasks → `once` tasks, expenses → `transactions` (expense,
  Uncategorized), documents → document + markdown v1, journal → entries
  (body in *Designed*).

## Layout

```
site/                  the app (vite root): index.html, styles.css, js/
  js/main.js           boot, auth, shell, router
  js/db.js             supabase client, cache, optimistic writes
  js/views/            home · leads · tasks · finance · documents · journal
supabase/migration.sql       the v3 database, run once
supabase/migration_v3_1.sql  v3.1 additions (content, accounts, subscriptions), run once
src/, public/          the OLD v1 Astro site, kept as reference; not deployed
```

## Permanently out of scope

Charts libraries, multi-user/sharing, notifications, integrations, AI features,
multi-tag/tag colors, comments, public pages, Edge Functions, light mode,
drag-and-drop, per-version deletion, full-text search.
