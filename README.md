# REBL HQ v3.3

Private founder dashboard for a one-person company. One Supabase login, ten
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
| **Notes** | A modern notes surface (Keep/Bear-style): masonry card grid with pin-to-top, muted color labels, freeform categories, note-level labels, full-text search, archive, and markdown bodies |
| **Accounts** | Registry of social/web accounts: platform, handle, profile URL, login email, purpose. **Never passwords** — those live in your password manager |
| **Websites** | Track sites: live/down/building/paused status (colored pills), domain renewal date → computed "renews in XX days" countdown (overdue/soon/ok tones), provider, filters incl. "renewing ≤30d". Down-first status summary surfaces on Home |

**Tags** (Rebl / Orbit / your own) mark which company a record belongs to. The
global filter at the top of the sidebar scopes *everything* — Home metrics,
tables, counts — and shows a "Filtered · X" indicator on every page. Untagged
records appear only under All.

Backend: **Supabase** (Postgres + Auth + Storage), accessed straight from the
browser. Owner-only row-level security on every table; no server of our own.

## One-time Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (free tier is fine).
2. **SQL editor** → paste and run the whole of [supabase/migration.sql](supabase/migration.sql),
   then [supabase/migration_v3_1.sql](supabase/migration_v3_1.sql),
   [supabase/migration_v3_2.sql](supabase/migration_v3_2.sql), then
   [supabase/migration_v3_3.sql](supabase/migration_v3_3.sql). This creates all
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

## Backups — the 3-2-1 rule

Your data is the company, so there are **three independent copies**:

1. **Live data — Supabase Postgres + the private `hq-docs` bucket.** RLS
   owner-only. **Turn on Supabase's own backups** (Dashboard → Database →
   Backups): daily backups on every plan, and Point-in-Time Recovery on Pro.
   This is the real database-level safety net and recovers the whole project.
2. **In-project snapshots — automatic, once a day.** On login the app writes an
   integrity-checked JSON dump into `{uid}/backups/`. Retention keeps the last
   **14 daily + 12 monthly** snapshots (long history, bounded size). Each dump
   carries a `manifest` with per-table row counts and a **SHA-256 checksum** of
   the data.
3. **Off-site — the full backup zip → your Google Drive.** In **Backup**, click
   **Download full backup (.zip)**: `data.json` (every table, checksummed) +
   **every uploaded file** + a `README.txt`. Save it into your Google Drive
   folder (or the Drive desktop app) so it's off-site and independent of
   Supabase. Home shows a nudge when this is **> 14 days old** or missing.

**Verify before you trust.** Backup → **Verify a backup** re-reads any `.json`
or `.zip` and re-computes the checksum, so a corrupt or truncated file is caught
*before* you ever need to restore it.

**Restore** — sidebar **Import** accepts a `.json` (export/snapshot) or a full
backup `.zip`. It verifies shape + checksum, shows the row/file counts to
confirm, then **adds only rows whose id doesn't already exist** — never
overwrites or deletes. (Uploaded file *binaries* live in storage; if you lose
the Supabase project, restore files from the off-site zip.)

- **Export** (sidebar) is the quick `data.json` only (checksummed; no file
  binaries — versions keep their storage path).
- **Import** also migrates the old v2 localStorage-app export (leads → `leads`,
  tasks → `once` tasks, expenses → `transactions`, documents → markdown v1,
  journal → entries).

## Security

- **RLS default-deny, owner-only** on every table; the anon key holds zero data
  access when signed out (verify with a signed-out `select`). Storage is a
  private bucket; every read is a short-lived signed URL, writes are restricted
  to your own `{uid}/` prefix.
- **Content-Security-Policy** (meta + Vercel headers): `script-src 'self'` (no
  inline JS), and `connect-src` limited to self + Supabase — so even a
  hypothetical injection can't run an external script or exfiltrate data to
  another origin. Plus `nosniff`, `frame-ancestors 'none'`, `no-referrer`, HSTS.
- **Untrusted content is sanitized.** Markdown is rendered through DOMPurify
  (scripts/handlers/`javascript:` stripped; links forced to
  `rel="noopener noreferrer"`). User-entered URLs (website/account/content links)
  pass through a scheme allowlist (`http`/`https`/`mailto` only).
- **Never store passwords or secrets** in the app — Accounts holds handles and
  login emails only; passwords live in your password manager.

## Layout

```
site/                  the app (vite root): index.html, styles.css, js/
  js/main.js           boot, auth, shell, router
  js/db.js             supabase client, cache, optimistic writes
  js/views/            home · leads · tasks · finance · documents · journal
supabase/migration.sql       the v3 database, run once
supabase/migration_v3_1.sql  v3.1 additions (content, accounts, subscriptions), run once
supabase/migration_v3_2.sql  v3.2 addition (notes), run once
supabase/migration_v3_3.sql  v3.3 addition (websites), run once
src/, public/          the OLD v1 Astro site, kept as reference; not deployed
```

## Permanently out of scope

Charts libraries, multi-user/sharing, notifications, integrations, AI features,
multi-tag/tag colors, comments, public pages, Edge Functions, light mode,
drag-and-drop, per-version deletion, full-text search.
