// JOURNAL — one entry per working session: DESIGNED/DECIDED · REJECTED · WHY.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr } from "../ui.js";
import { renderMd } from "../md.js";
import { visible, filterBadge, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

let editingId = null; // entry id, or "new"

const FIELDS = [
  ["designed", "Designed / Decided"],
  ["rejected", "Rejected"],
  ["why", "Why"],
];

function entryForm(en) {
  return `
    <div class="entry panel" data-entry="${en?.id || "new"}">
      <div class="entry-edit-row">
        <input class="input" type="date" id="je-date" value="${en?.entry_date || todayStr()}" style="max-width:170px" />
        <input class="input" id="je-title" placeholder="Title" value="${esc(en?.title || "")}" />
        ${tagSelectHtml(en ? en.tag_id || "" : undefined, 'id="je-tag"')}
      </div>
      ${FIELDS.map(
        ([f, label]) => `
        <div class="label" style="margin:14px 0 6px">${label}</div>
        <textarea class="doc-body doc-body--entry" id="je-${f}" placeholder="Markdown…">${esc(en?.[f] || "")}</textarea>`
      ).join("")}
      <div class="modal-actions" style="margin-top:14px">
        <button class="btn btn--primary" id="je-save">Save</button>
        <button class="btn" id="je-cancel">Cancel</button>
      </div>
    </div>`;
}

function entryView(en) {
  return `
    <article class="entry" data-entry="${en.id}">
      <div class="entry-head">
        <span class="label">${en.entry_date}</span>
        <span class="entry-title">${esc(en.title)}</span>
        ${tagChipHtml(en.tag_id)}
        <span style="flex:1"></span>
        <button class="linklike" data-edit-entry="${en.id}">Edit</button>
        <button class="icon-btn" data-del-entry="${en.id}" title="Delete">×</button>
      </div>
      ${FIELDS.filter(([f]) => en[f] && en[f].trim())
        .map(
          ([f, label]) => `
        <div class="label" style="margin:12px 0 4px">${label}</div>
        <div class="prose prose--entry">${renderMd(en[f])}</div>`
        )
        .join("")}
    </article>`;
}

export function renderJournal(main) {
  const entries = visible(cache.journal).sort((a, b) =>
    a.entry_date < b.entry_date ? 1 : a.entry_date > b.entry_date ? -1 : (a.created_at || "") < (b.created_at || "") ? 1 : -1
  );
  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">journal ${filterBadge()}</div>
        <h1 class="display">Journal</h1>
      </div>
    </div>
    <div class="toolbar"><button class="btn btn--primary" id="new-entry">+ New entry</button></div>
    ${editingId === "new" ? entryForm(null) : ""}
    ${
      entries.length
        ? entries.map((en) => (editingId === en.id ? entryForm(en) : entryView(en))).join("")
        : editingId === "new"
        ? ""
        : `<div class="empty">No entries yet. 90 seconds at the end of a session — that's the whole ritual.</div>`
    }`;

  $("#new-entry", main).addEventListener("click", () => {
    editingId = "new";
    rerender();
  });
  $$("[data-edit-entry]", main).forEach((b) =>
    b.addEventListener("click", () => {
      editingId = b.dataset.editEntry;
      rerender();
    })
  );
  $$("[data-del-entry]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this entry?")) return;
      del("journal_entries", b.dataset.delEntry);
    })
  );

  const form = $(".entry.panel", main);
  if (form) {
    $("#je-tag", form).addEventListener("change", (e) => {
      const id = resolveTagChange(e.target);
      if (id !== null) e.target.value = id;
    });
    $("#je-cancel", form).addEventListener("click", () => {
      editingId = null;
      rerender();
    });
    $("#je-save", form).addEventListener("click", () => {
      const title = $("#je-title", form).value.trim();
      if (!title) return;
      const patch = {
        entry_date: $("#je-date", form).value || todayStr(),
        title,
        tag_id: $("#je-tag", form).value || null,
        designed: $("#je-designed", form).value.trim() || null,
        rejected: $("#je-rejected", form).value.trim() || null,
        why: $("#je-why", form).value.trim() || null,
      };
      if (editingId === "new") ins("journal_entries", { ...patch, created_at: new Date().toISOString() });
      else upd("journal_entries", editingId, patch);
      editingId = null;
      rerender();
    });
  }
}
