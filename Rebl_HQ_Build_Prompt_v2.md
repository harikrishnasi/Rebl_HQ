# BUILD PROMPT — REBL HQ (Company Dashboard + Knowledge Base, one site)
### v2.0 — supersedes Rebl_Archive_Build_Prompt.md. Paste whole into Claude Code. Self-contained.

You are building **Rebl HQ** — a private, single-user company operating site for a one-person startup. Two halves, one design system: a **Dashboard** (live company state) and an **Archive** (versioned markdown knowledge base). Static-first, git as the database, browser-editable via a git-based CMS. No custom backend, no external database, no paid services.

## 1. Stack
- **Astro** (latest), static output. Content Collections for markdown + YAML data.
- **Pagefind** for search (build-time, client-side).
- **Decap CMS** mounted at `/admin` — git-backend browser editing for BOTH markdown docs and YAML data files. This is how editing works from a phone: open /admin, edit, save → commit → auto-redeploy. No other editing mechanism.
- Tailwind 4 or plain CSS. React islands only where interactive (search, CMS, pipeline filters).
- Deploy: Vercel or Cloudflare Pages (builder picks; if Cloudflare, note that Cloudflare Access can add free login protection later — do not implement auth in-app).
- Privacy for v1: private repo + `noindex` meta + robots.txt disallow + unlisted domain. No login system in scope.

## 2. Site map
```
/                → Dashboard home
/pipeline        → full pipeline table view
/decisions       → decision journal
/tasks           → task board
/archive         → KB home (section cards + search)
/archive/{section}/        → section index
/archive/{section}/{slug}  → doc page
/admin           → Decap CMS
```

## 3. DASHBOARD (data-file driven; every file editable in /admin)

**/data/mission.yaml** → hero banner: mission line ("Phase 3 ships · 3 houses sign · 90 days decide"), phase label, target_date → rendered days-remaining counter.

**/data/metrics.yaml** → stat cards array {label, value, delta, caption}. Rendered as obsidian stat cells (the "Know your room" style): venues contacted, interviews done, founding houses signed, MRR, monthly burn, runway months. Manual values — no integrations.

**/data/pipeline.yaml** → THE centerpiece. Array: {venue, segment: brewery|club|sneaker|cafe|gym|other, contact, warmth: cold|warm|regular, stage: shortlist|dm_sent|replied|interview|offer|signed|passed, next_action, notes, updated}. Dashboard home shows a stage-grouped summary strip (counts per stage as a funnel) + the 8 most recently updated rows; /pipeline shows all with client-side stage/segment filters. Stage badges: shortlist bone-dim → signed silver (passed = strikethrough). Empty state, verbatim: "No venues yet. The list is the company."

**/data/decisions.yaml** → {date, decision, reason, category: product|money|brand|gtm|ops}. Newest first; /decisions filterable by category.

**/data/tasks.yaml** → groups today/this_week/parked, items {text, done}. Checkboxes render state; toggling happens in /admin (acceptable — this is a weekly-review tool, not a todo app).

Dashboard home composition, top to bottom: mission banner → metrics row → pipeline funnel strip + recent rows → latest 5 decisions → today's tasks. One glanceable screen.

## 4. ARCHIVE (the KB — versioned markdown)
Sections fixed: `now · strategy · gtm · product · brand · research · company`.
(`gtm` holds GTM playbooks, outreach scripts and DM templates, marketing strategy, social identity docs, campaign plans, the founding-house pitch. `research` stays separate: research = evidence in, gtm = action out.)
Frontmatter schema:
```yaml
title, version ("0.2"), status: draft|locked|superseded, section,
canonical: repo|notion|archive, date, summary, supersedes (optional filename)
```
Rules:
- Doc identity = title. Highest non-superseded version renders as current; older versions listed in an "Archive" block at page bottom, viewable read-only with a "SUPERSEDED · v0.1" banner. No diffs, no git-history UI.
- Version ritual (document in README + a _TEMPLATE.md): duplicate file → bump version → set old status superseded.
- `canonical: repo|notion` docs show a subtle "MIRROR — canonical lives in {x}" banner.
- Section index tables: title · vX badge · status badge · date · summary; locked first; superseded hidden behind a toggle.
- Doc pages: frontmatter header block, right-rail TOC (h2/h3), 68ch measure, print stylesheet.
- Search (/archive, hotkey `/`): Pagefind across all current docs, grouped by section.

## 5. Design system (Rebl brand, non-negotiable)
```css
--obsidian:#0B0C0E; --surface:#131518; --raised:#1B1E22; --border:#2A2E34;
--bone:#E8E9EB; --bone-dim:#9298A0; --silver:#C9CCD1; --brass:#B08D57;
```
- Big Shoulders headings (32px+ only) · Satoshi body · wide-tracked uppercase Satoshi (.18em, 12px) for every label/badge. NO monospace.
- Dark only. 1px borders, 2px radius, no shadows/gradients. Brass appears ONLY on: the mission banner accent and `canonical: archive` badges.
- Nav: left wordmark "REBL HQ", links Dashboard · Pipeline · Decisions · Tasks · Archive; `/` focuses search.
- Typography-first reading experience; the dashboard should feel like a quiet instrument panel, not a SaaS analytics page. No charts libraries — the funnel strip is CSS bars, any trend is a number with a delta, not a graph.

## 6. Quality bar
- Lighthouse ≥95 all categories; instant on mobile data; zero client JS outside search/CMS/filter islands.
- Fully keyboard navigable, silver focus rings, semantic HTML.
- Works at 360px: dashboard stacks, pipeline table becomes cards.
- README: add-a-doc, version ritual, edit-from-phone via /admin walkthrough, deploy steps, bulk-import guide for existing .md files.
- Seed: all data files populated with realistic empty-state/starter content; three demo docs showing the version chain; seed with 3 example pipeline rows marked clearly as examples. Create all seven section folders (including `gtm`) and register each as a collection in Decap's config.

## 7. Permanently out of scope (do not build, do not suggest)
Custom auth, multi-user, comments, integrations (Notion/Sheets/APIs), charts libraries, diff views, notifications, AI features, light mode, analytics, drag-and-drop boards. If tempted: add to README "maybe never" list.

Build order (show output after each): 1) tokens + shell + nav 2) Archive: one beautiful doc page → section indexes → search 3) Dashboard: data files → home → pipeline view 4) Decap /admin wired to all content 5) polish vs §6. 
