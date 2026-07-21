// WEBSITES — track live/down status and domain-renewal countdowns.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr, diffDays } from "../ui.js";
import { visible, filterBadge, activeTag, tagSelectHtml, resolveTagChange } from "../tags.js";

export const WEB_STATUSES = ["live", "down", "building", "paused"];
const STATUS_LABEL = { live: "Live", down: "Down", building: "Building", paused: "Paused" };

/** computed renewal badge from a renewal date (the "up for renewal in XX days" logic) */
export function renewalInfo(dateStr, today = todayStr()) {
  if (!dateStr) return { label: "", tone: "none", days: null };
  const d = diffDays(today, dateStr);
  if (d < 0) return { label: `Renewal ${-d}d overdue`, tone: "overdue", days: d };
  if (d === 0) return { label: "Renews today", tone: "overdue", days: 0 };
  if (d <= 30) return { label: `Renews in ${d}d`, tone: "soon", days: d };
  if (d <= 90) return { label: `Renews in ${d}d`, tone: "ok", days: d };
  const months = Math.round(d / 30);
  return { label: `Renews in ~${months}mo`, tone: "ok", days: d };
}

/** status pill html */
export function statusPill(status) {
  const s = status || "live";
  return `<span class="web-status web-status--${s}"><span class="web-dot"></span>${STATUS_LABEL[s] || s}</span>`;
}

let chip = "";        // status filter
let soonOnly = false; // "renewing ≤30d" quick filter
let q = "";

function statusSelect(w) {
  return `<select class="cell cell--select web-status-select" data-row="${w.id}" data-f="status" data-web-status="${esc(w.status || "live")}">
    ${WEB_STATUSES.map((s) => `<option value="${s}" ${s === (w.status || "live") ? "selected" : ""}>${STATUS_LABEL[s]}</option>`).join("")}
  </select>`;
}

export function renderWebsites(main) {
  const all = visible(cache.websites);
  const counts = {};
  for (const w of all) counts[w.status] = (counts[w.status] || 0) + 1;
  const soonCount = all.filter((w) => { const r = renewalInfo(w.renewal_on); return r.days !== null && r.days <= 30; }).length;

  const rows = all
    .filter((w) => !chip || w.status === chip)
    .filter((w) => { if (!soonOnly) return true; const r = renewalInfo(w.renewal_on); return r.days !== null && r.days <= 30; })
    .filter((w) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return ["name", "url", "provider", "notes", "status"].some((f) => String(w[f] || "").toLowerCase().includes(s));
    })
    .sort((a, b) => {
      // down first, then soonest renewal, then name
      if ((a.status === "down") !== (b.status === "down")) return a.status === "down" ? -1 : 1;
      const ra = renewalInfo(a.renewal_on).days, rb = renewalInfo(b.renewal_on).days;
      if (ra !== rb) return (ra ?? 1e9) - (rb ?? 1e9);
      return (a.name || "").localeCompare(b.name || "");
    });

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">infrastructure ${filterBadge()}</div>
        <h1 class="display">Websites</h1>
      </div>
    </div>
    <div class="toolbar">
      <button class="btn btn--primary" id="add-web">+ Website</button>
      <input class="input input--search" id="web-q" placeholder="Filter…" value="${esc(q)}" />
      <span class="label">${all.length} site${all.length === 1 ? "" : "s"}</span>
    </div>
    <div class="filter-bar">
      <span class="label">Status</span>
      <button class="chip" data-chip="" aria-pressed="${!chip}">All · ${all.length}</button>
      ${WEB_STATUSES.map(
        (s) => `<button class="chip" data-chip="${s}" aria-pressed="${chip === s}">${STATUS_LABEL[s]} · ${counts[s] || 0}</button>`
      ).join("")}
      ${soonCount ? `<button class="chip chip--renew" data-soon aria-pressed="${soonOnly}">Renewing ≤30d · ${soonCount}</button>` : ""}
    </div>
    ${
      rows.length
        ? `<div class="table-wrap"><table class="rebl rebl--tracker"><thead><tr>
            <th class="label-th">Site</th><th class="label-th">URL</th><th class="label-th">Status</th>
            <th class="label-th">Renewal</th><th class="label-th">Provider</th><th class="label-th">Tag</th>
            <th class="label-th">Notes</th><th></th>
          </tr></thead><tbody>
          ${rows
            .map((w) => {
              const r = renewalInfo(w.renewal_on);
              return `<tr data-web="${w.id}">
              <td><input class="cell" data-row="${w.id}" data-f="name" value="${esc(w.name)}" placeholder="getrebl.com" /></td>
              <td class="link-cell">
                <input class="cell" data-row="${w.id}" data-f="url" value="${esc(w.url || "")}" placeholder="https://" />
                ${w.url ? `<a class="open-link" href="${esc(w.url)}" target="_blank" rel="noopener">Open ↗</a>` : ""}
              </td>
              <td>${statusSelect(w)}</td>
              <td>
                <input class="cell" type="date" data-row="${w.id}" data-f="renewal_on" value="${w.renewal_on || ""}" />
                ${r.label ? `<span class="renew-badge renew-badge--${r.tone}">${r.label}</span>` : ""}
              </td>
              <td><input class="cell" data-row="${w.id}" data-f="provider" value="${esc(w.provider || "")}" placeholder="Vercel…" /></td>
              <td>${tagSelectHtml(w.tag_id || "", `data-row-tag="${w.id}"`)}</td>
              <td><input class="cell" data-row="${w.id}" data-f="notes" value="${esc(w.notes || "")}" /></td>
              <td class="td-del"><button class="icon-btn" data-del-web="${w.id}" title="Delete">×</button></td>
            </tr>`;
            })
            .join("")}</tbody></table></div>`
        : `<div class="empty">No websites${chip || q || soonOnly ? " match" : " tracked yet. Add your domains and watch the renewals"}.</div>`
    }`;

  $("#add-web", main).addEventListener("click", () => {
    const row = ins("websites", {
      name: "",
      status: chip && WEB_STATUSES.includes(chip) ? chip : "live",
      tag_id: activeTag() || null,
      created_at: new Date().toISOString(),
    });
    setTimeout(() => $(`tr[data-web="${row.id}"] .cell`)?.focus(), 0);
  });

  let qTimer;
  $("#web-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#web-q");
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 250);
  });

  $$("[data-chip]", main).forEach((b) =>
    b.addEventListener("click", () => { chip = b.dataset.chip; rerender(); })
  );
  $("[data-soon]", main)?.addEventListener("click", () => { soonOnly = !soonOnly; rerender(); });

  const tbody = $("tbody", main);
  tbody?.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.rowTag !== undefined) {
      const id = resolveTagChange(el);
      if (id !== null) upd("websites", el.dataset.rowTag, { tag_id: id || null });
      return;
    }
    if (!el.dataset.f) return;
    upd("websites", el.dataset.row, { [el.dataset.f]: el.dataset.f === "name" ? el.value : el.value || null });
    if (el.dataset.f === "status") rerender(); // repaint pill color + re-sort
  });

  $$("[data-del-web]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this website?")) return;
      del("websites", b.dataset.delWeb);
    })
  );
}
