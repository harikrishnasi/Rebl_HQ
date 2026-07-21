// Shared helpers: DOM, formatting, dates, toast, modal, sync indicator.

export const $ = (sel, el = document) => el.querySelector(sel);
export const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/** Sanitize a user-provided URL: only http(s)/mailto/relative pass; blocks
 *  javascript:, data:, vbscript:, etc. Returns "" if unsafe (caller hides the link). */
export function safeUrl(raw) {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  if (/^(\/|\.|#|\?)/.test(s)) return s;                 // relative / fragment
  const m = s.match(/^([a-zA-Z][a-zA-Z0-9+.\-]*):/);      // has an explicit scheme?
  if (!m) return "https://" + s;                          // bare domain → assume https
  const scheme = m[1].toLowerCase();
  return scheme === "http" || scheme === "https" || scheme === "mailto" ? s : "";
}

export const uid = () =>
  crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
      });

/* ---------------- dates ---------------- */

export const todayStr = () => toStr(new Date());
export function toStr(d) {
  const z = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
export const fromStr = (s) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
};
export function addDays(s, n) {
  const d = fromStr(s);
  d.setDate(d.getDate() + n);
  return toStr(d);
}
export const diffDays = (a, b) => Math.round((fromStr(b) - fromStr(a)) / 86400000);
export const monthKey = (s) => s.slice(0, 7);

/** Monday of the ISO week containing date string s */
export function weekStart(s) {
  const d = fromStr(s);
  const dow = (d.getDay() + 6) % 7; // Mon=0..Sun=6
  d.setDate(d.getDate() - dow);
  return toStr(d);
}
export const weekEnd = (s) => addDays(weekStart(s), 6);

/** day-of-month clamped to the month of date string s */
export function clampedDayInMonth(s, day) {
  const d = fromStr(s);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return toStr(new Date(d.getFullYear(), d.getMonth(), Math.min(day, last)));
}
export function addMonths(key, n) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
export function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/* ---------------- money ---------------- */

const inr0 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
export const fmtMoney = (n, dec = false) => (dec ? inr2 : inr0).format(Number(n) || 0);

/* ---------------- render bus ---------------- */

let renderFn = () => {};
export const setRender = (fn) => (renderFn = fn);
export const rerender = () => renderFn();

/* ---------------- toast ---------------- */

export function toast(msg, isError = false) {
  let host = $("#toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "toasts";
    document.body.appendChild(host);
  }
  const t = document.createElement("div");
  t.className = "toast" + (isError ? " toast--error" : "");
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

/* ---------------- modal ---------------- */

export function openModal(html) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `<div class="modal panel">${html}</div>`;
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.addEventListener("click", (e) => e.target === overlay && close());
  overlay.addEventListener("keydown", (e) => e.key === "Escape" && close());
  $("input, select, textarea, button", overlay)?.focus();
  return { overlay, close };
}

/* ---------------- sync indicator ---------------- */

let inflight = 0;
let syncFailed = false;

export function syncStart() {
  inflight++;
  syncFailed = false;
  paintSync();
}
export function syncEnd(ok = true) {
  inflight = Math.max(0, inflight - 1);
  if (!ok) syncFailed = true;
  paintSync();
}
export function paintSync() {
  const el = $("#sync");
  if (!el) return;
  if (syncFailed) {
    el.innerHTML = `<span class="sync sync--error">● sync failed — retry on next edit</span>`;
  } else if (inflight > 0) {
    el.innerHTML = `<span class="sync sync--busy">⟳ syncing…</span>`;
  } else {
    el.innerHTML = `<span class="sync">✓ synced</span>`;
  }
}

/* ---------------- theme ---------------- */

export const currentTheme = () =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";

export function toggleTheme() {
  const next = currentTheme() === "light" ? "dark" : "light";
  if (next === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  try {
    localStorage.setItem("rebl.theme", next);
  } catch {}
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute("content", next === "light" ? "#F5F4F2" : "#0B0C0E");
  return next;
}

/** label for a toggle button: names the mode you'd switch TO */
export const themeButtonLabel = () => (currentTheme() === "light" ? "Dark mode" : "Light mode");
