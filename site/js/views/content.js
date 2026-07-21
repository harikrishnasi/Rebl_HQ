// CONTENT — display-first posts pipeline (Idea → Drafted → Scheduled → Posted).
// Clean read-only rows; Edit reveals the form. Mirrors the Leads record pattern.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr, safeUrl } from "../ui.js";
import { visible, filterBadge, activeTag, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

export const CONTENT_STATUSES = ["Idea", "Drafted", "Scheduled", "Posted"];
const CHANNELS = ["LinkedIn", "Twitter", "Instagram", "Blog", "Other"];

let chip = ""; // status filter
let channel = "";
let q = "";
let editingId = null;

const fmtDate = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

function editCard(c) {
  const opt = (v, options) => {
    const opts = [...options];
    if (v && !opts.includes(v)) opts.unshift(v);
    return opts.map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
  };
  return `
    <div class="record record--editing" data-content="${c.id}">
      <div class="record-grid">
        <label class="field field--wide"><span class="field-label">Title</span>
          <input class="input" data-f="title" value="${esc(c.title)}" placeholder="Post title / hook" autofocus /></label>
        <label class="field"><span class="field-label">Channel</span>
          <select class="input" data-f="channel">${opt(c.channel, CHANNELS)}</select></label>
        <label class="field"><span class="field-label">Status</span>
          <select class="input" data-f="status">${opt(c.status, CONTENT_STATUSES)}</select></label>
        <label class="field"><span class="field-label">Publish on</span>
          <input class="input" type="date" data-f="publish_on" value="${c.publish_on || ""}" /></label>
        <label class="field"><span class="field-label">Tag</span>
          ${tagSelectHtml(c.tag_id || "", 'data-f="tag_id"')}</label>
        <label class="field field--wide"><span class="field-label">Link</span>
          <input class="input" data-f="link" value="${esc(c.link || "")}" placeholder="https://…" /></label>
        <label class="field field--wide"><span class="field-label">Notes</span>
          <input class="input" data-f="notes" value="${esc(c.notes || "")}" placeholder="Angle, draft location…" /></label>
      </div>
      <div class="record-edit-actions">
        <button class="btn btn--primary" data-done="${c.id}">Done</button>
        <button class="icon-btn" data-del-content="${c.id}" title="Delete">Delete ×</button>
      </div>
    </div>`;
}

function displayRow(c) {
  const meta = [];
  if (c.publish_on) meta.push(`<span>${fmtDate(c.publish_on)}</span>`);
  if (c.notes) meta.push(`<span class="record-notes">${esc(c.notes)}</span>`);
  const url = safeUrl(c.link);
  return `
    <div class="record" data-content="${c.id}">
      <div class="record-main">
        <div class="record-top">
          <span class="record-name">${esc(c.title) || '<span class="muted">Untitled post</span>'}</span>
          <span class="badge" data-status="${esc(c.status)}">${esc(c.status)}</span>
          <span class="record-tag-seg">${esc(c.channel)}</span>
          ${tagChipHtml(c.tag_id)}
        </div>
        <div class="record-meta">
          ${meta.length ? meta.join('<span class="record-sep">·</span>') : '<span class="muted">No details yet — Edit to add</span>'}
          ${url ? `${meta.length ? '<span class="record-sep">·</span>' : ""}<a class="open-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}
        </div>
      </div>
      <div class="record-actions">
        <button class="linklike" data-edit="${c.id}">Edit</button>
        <button class="icon-btn" data-del-content="${c.id}" title="Delete">×</button>
      </div>
    </div>`;
}

function sortRows(rows) {
  const nullsLast = (v) => v || "9999-99-99";
  if (chip === "Posted") return rows.sort((a, b) => ((a.publish_on || "") < (b.publish_on || "") ? 1 : -1));
  return rows.sort((a, b) => (nullsLast(a.publish_on) > nullsLast(b.publish_on) ? 1 : -1));
}

export function renderContent(main) {
  const all = visible(cache.content);
  const counts = {};
  for (const c of all) counts[c.status] = (counts[c.status] || 0) + 1;
  const rows = sortRows(
    all
      .filter((c) => !chip || c.status === chip)
      .filter((c) => !channel || c.channel === channel)
      .filter((c) => {
        if (!q) return true;
        const s = q.toLowerCase();
        return ["title", "notes", "link", "channel", "status"].some((f) => String(c[f] || "").toLowerCase().includes(s));
      })
  );

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">posts ${filterBadge()}</div>
        <h1 class="display">Content</h1>
      </div>
    </div>
    <div class="toolbar">
      <button class="btn btn--primary" id="add-content">+ Post</button>
      <select class="input input--search" id="content-channel" style="max-width:150px">
        <option value="">All channels</option>
        ${CHANNELS.map((c) => `<option ${channel === c ? "selected" : ""}>${c}</option>`).join("")}
      </select>
      <input class="input input--search" id="content-q" placeholder="Filter…" value="${esc(q)}" />
      <span class="label">${all.length} item${all.length === 1 ? "" : "s"}</span>
    </div>
    <div class="filter-bar">
      <span class="label">Status</span>
      <button class="chip" data-chip="" aria-pressed="${!chip}">All · ${all.length}</button>
      ${CONTENT_STATUSES.map((s) => `<button class="chip" data-chip="${s}" aria-pressed="${chip === s}">${s} · ${counts[s] || 0}</button>`).join("")}
    </div>
    ${
      rows.length
        ? `<div class="record-list">${rows.map((c) => (editingId === c.id ? editCard(c) : displayRow(c))).join("")}</div>`
        : `<div class="empty">No content${chip || q || channel ? " matches" : " yet. One post idea beats zero posts"}.</div>`
    }`;

  $("#add-content", main).addEventListener("click", () => {
    const row = ins("content_items", {
      title: "",
      channel: "LinkedIn",
      status: chip && chip !== "Posted" ? chip : "Idea",
      tag_id: activeTag() || null,
      created_at: new Date().toISOString(),
    });
    editingId = row.id;
    rerender();
  });

  $("#content-channel", main).addEventListener("change", (e) => { channel = e.target.value; rerender(); });

  let qTimer;
  $("#content-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#content-q");
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 250);
  });

  $$("[data-chip]", main).forEach((b) =>
    b.addEventListener("click", () => { chip = b.dataset.chip; rerender(); })
  );
  $$("[data-edit]", main).forEach((b) =>
    b.addEventListener("click", () => { editingId = b.dataset.edit; rerender(); })
  );
  $$("[data-done]", main).forEach((b) =>
    b.addEventListener("click", () => { editingId = null; rerender(); })
  );
  $$("[data-del-content]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this content item?")) return;
      if (editingId === b.dataset.delContent) editingId = null;
      del("content_items", b.dataset.delContent);
    })
  );

  const list = $(".record-list", main);
  list?.addEventListener("change", (e) => {
    const el = e.target;
    const card = el.closest("[data-content]");
    if (!card || !el.dataset.f) return;
    const id = card.dataset.content;
    if (el.dataset.f === "tag_id") {
      const tid = resolveTagChange(el);
      if (tid !== null) upd("content_items", id, { tag_id: tid || null });
      return;
    }
    upd("content_items", id, { [el.dataset.f]: el.dataset.f === "title" ? el.value : el.value || null });
  });
}
