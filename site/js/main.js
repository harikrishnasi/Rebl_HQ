// REBL HQ v3 — boot, auth, shell, router.
import { initBackend, auth, loadAll, seedTags, setUserId, cache, missingTables } from "./db.js";
import { $, $$, esc, setRender, paintSync, todayStr, monthKey, toast, toggleTheme, themeButtonLabel } from "./ui.js";
import { activeTag, filterChipsHtml, wireFilterChips, manageTagsModal, visible } from "./tags.js";
import { exportJson, importJson } from "./importexport.js";
import { backupModal, maybeAutoSnapshot } from "./backup.js";
import { renderHome } from "./views/home.js";
import { renderLeads } from "./views/leads.js";
import { renderTasks, todayList, isDueToday } from "./views/tasks.js";
import { renderFinance } from "./views/finance.js";
import { renderDocuments, renderDocumentView } from "./views/documents.js";
import { renderJournal } from "./views/journal.js";
import { renderContent } from "./views/content.js";
import { renderAccounts } from "./views/accounts.js";

const app = document.getElementById("app");

const SECTIONS = [
  { path: "", name: "Home", render: renderHome },
  { path: "leads", name: "Leads", render: renderLeads },
  { path: "content", name: "Content", render: renderContent },
  { path: "tasks", name: "Tasks", render: renderTasks },
  { path: "finance", name: "Finance", render: renderFinance },
  { path: "documents", name: "Documents", render: renderDocuments },
  { path: "journal", name: "Journal", render: renderJournal },
  { path: "accounts", name: "Accounts", render: renderAccounts },
];

function counts(path) {
  if (path === "leads") return visible(cache.leads).length;
  if (path === "content") return visible(cache.content).filter((c) => c.status !== "Posted").length;
  if (path === "tasks") return todayList().filter((t) => isDueToday(t)).length;
  if (path === "finance")
    return visible(cache.transactions).filter((t) => monthKey(t.occurred_on) === monthKey(todayStr())).length;
  if (path === "documents") return visible(cache.documents).length;
  if (path === "journal") return visible(cache.journal).length;
  if (path === "accounts") return visible(cache.accounts).length;
  return null;
}

/* ---------------- screens ---------------- */

function renderFatal(message) {
  app.innerHTML = `
    <div class="gate">
      <div class="gate-box panel">
        <div class="wordmark">REBL HQ</div>
        <p class="muted" style="margin-top:16px">${esc(message)}</p>
      </div>
    </div>`;
}

function renderLogin() {
  app.innerHTML = `
    <button class="linklike theme-fab" id="gate-theme">${themeButtonLabel()}</button>
    <div class="gate">
      <form class="gate-box panel" id="login-form">
        <div class="wordmark">REBL HQ</div>
        <input class="input" id="login-email" type="email" placeholder="Email" autocomplete="username" required />
        <input class="input" id="login-pw" type="password" placeholder="Password" autocomplete="current-password" required />
        <button class="btn btn--brass" type="submit">Enter</button>
        <p class="muted gate-err" id="login-err" hidden></p>
      </form>
    </div>`;
  $("#gate-theme").addEventListener("click", (e) => {
    toggleTheme();
    e.target.textContent = themeButtonLabel();
  });
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#login-form .btn");
    btn.disabled = true;
    const { session, error } = await auth.signIn($("#login-email").value.trim(), $("#login-pw").value);
    if (error || !session) {
      const el = $("#login-err");
      el.textContent = error?.message || "Login failed.";
      el.hidden = false;
      btn.disabled = false;
      return;
    }
    enter(session);
  });
}

/* ---------------- shell ---------------- */

function renderShell() {
  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <button class="icon-btn" id="menu-btn" aria-label="Menu">☰</button>
        <span class="wordmark">REBL HQ</span>
      </header>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-head"><a class="wordmark" href="#/">REBL HQ</a></div>
        <div class="sidebar-filter" id="sidebar-filter"></div>
        <nav class="sidebar-nav" id="sidebar-nav"></nav>
        <div class="sidebar-foot">
          <div class="sidebar-tools">
            <button class="linklike" id="manage-tags-btn">Tags</button>
            <button class="linklike" id="backup-btn">Backup</button>
            <button class="linklike" id="export-btn">Export</button>
            <button class="linklike" id="import-btn">Import</button>
            <button class="linklike" id="logout-btn">Log out</button>
          </div>
          <button class="linklike" id="theme-btn">${themeButtonLabel()}</button>
          <div id="sync"></div>
        </div>
      </aside>
      <main class="main" id="main"></main>
      <div class="scrim" id="scrim"></div>
    </div>
    <input type="file" id="import-file" accept=".json,application/json" hidden />`;

  $("#manage-tags-btn").addEventListener("click", manageTagsModal);
  $("#backup-btn").addEventListener("click", backupModal);
  $("#export-btn").addEventListener("click", exportJson);
  $("#import-btn").addEventListener("click", () => $("#import-file").click());
  $("#import-file").addEventListener("change", importJson);
  $("#logout-btn").addEventListener("click", async () => {
    await auth.signOut();
    location.hash = "#/";
    location.reload();
  });
  $("#theme-btn").addEventListener("click", (e) => {
    toggleTheme();
    e.target.textContent = themeButtonLabel();
  });
  $("#menu-btn").addEventListener("click", () => document.body.classList.toggle("nav-open"));
  $("#scrim").addEventListener("click", () => document.body.classList.remove("nav-open"));
}

function route() {
  const parts = location.hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  if (parts[0] === "documents" && parts[1])
    return { docId: parts[1], section: SECTIONS.find((s) => s.path === "documents") };
  const section = SECTIONS.find((s) => s.path === (parts[0] || "")) || SECTIONS[0];
  return { section, docId: null };
}

function render() {
  if (!$("#main")) return;
  document.body.classList.remove("nav-open");
  const { section, docId } = route();

  const filterEl = $("#sidebar-filter");
  filterEl.innerHTML = filterChipsHtml();
  wireFilterChips(filterEl);

  $("#sidebar-nav").innerHTML = SECTIONS.map((s) => {
    const n = counts(s.path);
    const active = s === section;
    return `<a class="side-link ${active ? "side-link--active" : ""}" href="#/${s.path}">
      <span class="side-link-name">${s.name}</span>
      ${n !== null ? `<span class="side-link-count">${n}</span>` : ""}
    </a>`;
  }).join("");

  const main = $("#main");
  if (docId) renderDocumentView(main, docId);
  else section.render(main);
  paintSync();
}

/* ---------------- boot ---------------- */

async function enter(session) {
  setUserId(session.user?.id || session.userId || null);
  app.innerHTML = `<div class="boot label">REBL HQ</div>`;
  try {
    await loadAll();
    await seedTags();
  } catch (e) {
    console.error(e);
    renderFatal(
      "Could not load data: " + e.message +
      " — has supabase/migration.sql been run in your project's SQL editor?"
    );
    return;
  }
  renderShell();
  setRender(render);
  window.addEventListener("hashchange", render);
  render();
  if (missingTables.length)
    toast(`Missing tables: ${missingTables.join(", ")} — run supabase/migration_v3_1.sql`, true);
  maybeAutoSnapshot(); // one snapshot per day into the hq-docs bucket, fire-and-forget
}

async function boot() {
  const err = initBackend();
  if (err) return renderFatal(err);
  app.innerHTML = `<div class="boot label">REBL HQ</div>`;
  const session = await auth.getSession();
  if (!session) return renderLogin();
  enter(session);
}

boot();
