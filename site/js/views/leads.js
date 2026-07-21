// LEADS — display-first pipeline. Each lead is a clean read-only row (name
// prominent + full); click Edit to reveal the form. No always-on inputs, no
// horizontal scroll. Backed by the leads table.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr } from "../ui.js";
import { visible, filterBadge, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

export const STAGES = ["Shortlist", "Reached out", "Replied", "Meeting", "Follow up", "Signed", "Passed"];
const SEGMENTS = ["Brewery", "Club", "Sneaker", "Cafe", "Gym", "Other"];

let chip = ""; // stage filter
let q = "";
let editingId = null; // lead id currently in edit mode

const fmtDate = (s) => (s ? new Date(s + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "");

function editCard(l) {
  const opt = (v, options) => {
    const opts = [...options];
    if (v && !opts.includes(v)) opts.unshift(v);
    return opts.map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("");
  };
  return `
    <div class="record record--editing" data-lead="${l.id}">
      <div class="record-grid">
        <label class="field field--wide"><span class="field-label">Name</span>
          <input class="input" data-f="name" value="${esc(l.name)}" placeholder="Venue / company" autofocus /></label>
        <label class="field"><span class="field-label">Stage</span>
          <select class="input" data-f="stage">${opt(l.stage, STAGES)}</select></label>
        <label class="field"><span class="field-label">Segment</span>
          <select class="input" data-f="segment"><option value=""></option>${opt(l.segment || "", SEGMENTS)}</select></label>
        <label class="field"><span class="field-label">Contact</span>
          <input class="input" data-f="contact" value="${esc(l.contact || "")}" placeholder="@handle · name" /></label>
        <label class="field"><span class="field-label">Reach out on</span>
          <input class="input" type="date" data-f="reach_out_on" value="${l.reach_out_on || ""}" /></label>
        <label class="field"><span class="field-label">Follow up on</span>
          <input class="input" type="date" data-f="follow_up_on" value="${l.follow_up_on || ""}" /></label>
        <label class="field"><span class="field-label">Tag</span>
          ${tagSelectHtml(l.tag_id || "", 'data-f="tag_id"')}</label>
        <label class="field field--wide"><span class="field-label">Notes</span>
          <input class="input" data-f="notes" value="${esc(l.notes || "")}" placeholder="Context, next action…" /></label>
      </div>
      <div class="record-edit-actions">
        <button class="btn btn--primary" data-done="${l.id}">Done</button>
        <button class="icon-btn" data-del-lead="${l.id}" title="Delete">Delete ×</button>
      </div>
    </div>`;
}

function displayRow(l) {
  const day = todayStr();
  const meta = [];
  if (l.contact) meta.push(`<span>${esc(l.contact)}</span>`);
  if (l.segment) meta.push(`<span class="record-tag-seg">${esc(l.segment)}</span>`);
  if (l.reach_out_on) meta.push(`<span>Reach out ${fmtDate(l.reach_out_on)}</span>`);
  if (l.follow_up_on)
    meta.push(`<span class="${l.follow_up_on < day ? "record-overdue" : ""}">Follow up ${fmtDate(l.follow_up_on)}</span>`);
  if (l.notes) meta.push(`<span class="record-notes">${esc(l.notes)}</span>`);
  return `
    <div class="record" data-lead="${l.id}">
      <div class="record-main">
        <div class="record-top">
          <span class="record-name">${esc(l.name) || '<span class="muted">Untitled lead</span>'}</span>
          <span class="badge" data-stage="${esc(l.stage)}">${esc(l.stage)}</span>
          ${tagChipHtml(l.tag_id)}
        </div>
        <div class="record-meta">${meta.length ? meta.join('<span class="record-sep">·</span>') : '<span class="muted">No details yet — Edit to add</span>'}</div>
      </div>
      <div class="record-actions">
        <button class="linklike" data-edit="${l.id}">Edit</button>
        <button class="icon-btn" data-del-lead="${l.id}" title="Delete">×</button>
      </div>
    </div>`;
}

export function renderLeads(main) {
  const all = visible(cache.leads);
  const counts = {};
  for (const l of all) counts[l.stage] = (counts[l.stage] || 0) + 1;
  const rows = all
    .filter((l) => !chip || l.stage === chip)
    .filter((l) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return ["name", "contact", "segment", "notes", "stage"].some((f) => String(l[f] || "").toLowerCase().includes(s));
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">pipeline ${filterBadge()}</div>
        <h1 class="display">Leads</h1>
      </div>
    </div>
    <div class="toolbar">
      <button class="btn btn--primary" id="add-lead">+ Lead</button>
      <input class="input input--search" id="lead-q" placeholder="Filter…" value="${esc(q)}" />
      <span class="label">${all.length} lead${all.length === 1 ? "" : "s"}</span>
    </div>
    <div class="filter-bar">
      <span class="label">Stage</span>
      <button class="chip" data-chip="" aria-pressed="${!chip}">All · ${all.length}</button>
      ${STAGES.map((s) => `<button class="chip" data-chip="${s}" aria-pressed="${chip === s}">${s} · ${counts[s] || 0}</button>`).join("")}
    </div>
    ${
      rows.length
        ? `<div class="record-list">${rows.map((l) => (editingId === l.id ? editCard(l) : displayRow(l))).join("")}</div>`
        : `<div class="empty">No leads${chip || q ? " match" : " yet. The list is the company"}.</div>`
    }`;

  $("#add-lead", main).addEventListener("click", () => {
    const row = ins("leads", { name: "", stage: chip && chip !== "Passed" ? chip : "Shortlist", created_at: new Date().toISOString() });
    editingId = row.id;
    rerender();
  });

  let qTimer;
  $("#lead-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#lead-q");
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
  $$("[data-del-lead]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this lead?")) return;
      if (editingId === b.dataset.delLead) editingId = null;
      del("leads", b.dataset.delLead);
    })
  );

  // inline edits persist on change (blur) while in edit mode
  const list = $(".record-list", main);
  list?.addEventListener("change", (e) => {
    const el = e.target;
    const card = el.closest("[data-lead]");
    if (!card || !el.dataset.f) return;
    const id = card.dataset.lead;
    if (el.dataset.f === "tag_id") {
      const tid = resolveTagChange(el);
      if (tid !== null) upd("leads", id, { tag_id: tid || null });
      return;
    }
    const val = el.dataset.f === "name" ? el.value : el.value || null;
    upd("leads", id, { [el.dataset.f]: val });
    if (el.dataset.f === "stage") { const badge = 0; /* stage color updates on Done */ }
  });
}
