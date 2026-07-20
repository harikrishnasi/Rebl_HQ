// NOTES — a modern notes surface (Keep/Bear-style): a masonry-ish grid of
// cards with pin, color, category, note-level labels, search, and archive.
// Company tag (Rebl/Orbit) is honored by the global filter like everywhere.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, uid, todayStr, openModal } from "../ui.js";
import { renderMd } from "../md.js";
import { visible, filterBadge, activeTag, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

const COLORS = ["default", "amber", "rose", "sage", "sky", "violet", "slate"];

let q = "";
let catFilter = "";     // active category
let labelFilter = "";   // active label
let showArchived = false;

const parseLabels = (str) =>
  String(str || "").split(",").map((s) => s.trim()).filter(Boolean);

function noteCard(n) {
  const labels = (n.labels || []);
  return `
    <article class="note-card" data-note="${n.id}" data-color="${esc(n.color || "default")}">
      <button class="note-pin ${n.pinned ? "note-pin--on" : ""}" data-pin="${n.id}" title="${n.pinned ? "Unpin" : "Pin"}" aria-label="Pin">${n.pinned ? "★" : "☆"}</button>
      ${n.title ? `<h3 class="note-title">${esc(n.title)}</h3>` : ""}
      ${n.body ? `<div class="note-body prose prose--entry">${renderMd(n.body)}</div>` : (!n.title ? `<div class="note-body muted">Empty note</div>` : "")}
      <div class="note-foot">
        ${n.category ? `<span class="note-cat">${esc(n.category)}</span>` : ""}
        ${labels.map((l) => `<span class="note-label">${esc(l)}</span>`).join("")}
        ${tagChipHtml(n.tag_id)}
      </div>
      <div class="note-actions">
        <button class="linklike" data-edit="${n.id}">Edit</button>
        <button class="linklike" data-arch="${n.id}">${n.archived ? "Unarchive" : "Archive"}</button>
        <button class="icon-btn" data-del="${n.id}" title="Delete">×</button>
      </div>
    </article>`;
}

export function renderNotes(main) {
  const all = visible(cache.notes);
  const categories = [...new Set(all.map((n) => n.category).filter(Boolean))].sort();
  const allLabels = [...new Set(all.flatMap((n) => n.labels || []))].sort();

  const filtered = all
    .filter((n) => (showArchived ? n.archived : !n.archived))
    .filter((n) => !catFilter || n.category === catFilter)
    .filter((n) => !labelFilter || (n.labels || []).includes(labelFilter))
    .filter((n) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return [n.title, n.body, n.category, (n.labels || []).join(" ")].some((f) =>
        String(f || "").toLowerCase().includes(s)
      );
    });

  const sortNotes = (arr) =>
    arr.sort((a, b) => ((a.updated_at || a.created_at || "") < (b.updated_at || b.created_at || "") ? 1 : -1));
  const pinned = sortNotes(filtered.filter((n) => n.pinned && !n.archived));
  const others = sortNotes(filtered.filter((n) => !(n.pinned && !n.archived)));

  const archivedCount = all.filter((n) => n.archived).length;

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">notes ${filterBadge()}</div>
        <h1 class="display">Notes</h1>
      </div>
    </div>

    <div class="toolbar">
      <button class="btn btn--primary" id="new-note">+ Note</button>
      <input class="input input--search" id="note-q" placeholder="Search notes…" value="${esc(q)}" />
      <span class="label">${all.filter((n) => !n.archived).length} note${all.filter((n) => !n.archived).length === 1 ? "" : "s"}</span>
      ${archivedCount ? `<button class="chip" id="toggle-arch" aria-pressed="${showArchived}">Archived · ${archivedCount}</button>` : ""}
    </div>

    ${
      categories.length || allLabels.length
        ? `<div class="filter-bar">
            ${categories.length ? `<span class="label">Category</span>` : ""}
            ${categories
              .map((c) => `<button class="chip" data-cat="${esc(c)}" aria-pressed="${catFilter === c}">${esc(c)}</button>`)
              .join("")}
            ${allLabels.length ? `<span class="label" style="margin-left:8px">Label</span>` : ""}
            ${allLabels
              .map((l) => `<button class="chip" data-label="${esc(l)}" aria-pressed="${labelFilter === l}">${esc(l)}</button>`)
              .join("")}
            ${catFilter || labelFilter ? `<button class="linklike" id="clear-filters">Clear</button>` : ""}
          </div>`
        : ""
    }

    ${
      filtered.length
        ? `${
            pinned.length
              ? `<div class="label note-group-label">Pinned</div>
                 <div class="note-grid">${pinned.map(noteCard).join("")}</div>
                 ${others.length ? `<div class="label note-group-label">Others</div>` : ""}`
              : ""
          }
          ${others.length ? `<div class="note-grid">${others.map(noteCard).join("")}</div>` : ""}`
        : `<div class="empty">${
            showArchived ? "No archived notes." : q || catFilter || labelFilter ? "No notes match." : "No notes yet. Capture the first thought."
          }</div>`
    }`;

  $("#new-note", main).addEventListener("click", () => noteModal(null));

  let qTimer;
  $("#note-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#note-q");
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 250);
  });

  $("#toggle-arch", main)?.addEventListener("click", () => { showArchived = !showArchived; rerender(); });
  $("#clear-filters", main)?.addEventListener("click", () => { catFilter = ""; labelFilter = ""; rerender(); });
  $$("[data-cat]", main).forEach((b) =>
    b.addEventListener("click", () => { catFilter = catFilter === b.dataset.cat ? "" : b.dataset.cat; rerender(); })
  );
  $$("[data-label]", main).forEach((b) =>
    b.addEventListener("click", () => { labelFilter = labelFilter === b.dataset.label ? "" : b.dataset.label; rerender(); })
  );

  $$("[data-pin]", main).forEach((b) =>
    b.addEventListener("click", () => {
      const n = cache.notes.find((x) => x.id === b.dataset.pin);
      if (n) upd("notes", n.id, { pinned: !n.pinned });
    })
  );
  $$("[data-edit]", main).forEach((b) =>
    b.addEventListener("click", () => noteModal(cache.notes.find((x) => x.id === b.dataset.edit)))
  );
  $$("[data-arch]", main).forEach((b) =>
    b.addEventListener("click", () => {
      const n = cache.notes.find((x) => x.id === b.dataset.arch);
      if (n) upd("notes", n.id, { archived: !n.archived });
    })
  );
  $$("[data-del]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this note?")) return;
      del("notes", b.dataset.del);
    })
  );
}

/* ---------------- editor modal ---------------- */

function noteModal(note) {
  const isNew = !note;
  const n = note || { color: "default", labels: [], category: "" };
  const { overlay, close } = openModal(`
    <div class="label">${isNew ? "New note" : "Edit note"}</div>
    <form class="modal-form" id="note-form">
      <input class="input" id="nt-title" placeholder="Title" value="${esc(n.title || "")}" />
      <textarea class="doc-body doc-body--entry" id="nt-body" placeholder="Write in markdown…">${esc(n.body || "")}</textarea>
      <div class="nt-row">
        <input class="input" id="nt-cat" placeholder="Category (optional)" value="${esc(n.category || "")}" list="nt-cats" />
        <datalist id="nt-cats">
          ${[...new Set(cache.notes.map((x) => x.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">`).join("")}
        </datalist>
        ${tagSelectHtml(n.tag_id || "", 'id="nt-tag"')}
      </div>
      <input class="input" id="nt-labels" placeholder="Labels, comma-separated" value="${esc((n.labels || []).join(", "))}" />
      <div class="nt-colors">
        ${COLORS.map(
          (c) => `<button type="button" class="nt-swatch ${(n.color || "default") === c ? "nt-swatch--on" : ""}" data-swatch="${c}" data-color="${c}" title="${c}" aria-label="${c}"></button>`
        ).join("")}
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">${isNew ? "Add note" : "Save"}</button>
      </div>
    </form>`);

  let color = n.color || "default";
  $$("[data-swatch]", overlay).forEach((b) =>
    b.addEventListener("click", () => {
      color = b.dataset.swatch;
      $$("[data-swatch]", overlay).forEach((x) => x.classList.toggle("nt-swatch--on", x.dataset.swatch === color));
    })
  );
  $("#nt-tag", overlay).addEventListener("change", (e) => {
    const id = resolveTagChange(e.target);
    if (id !== null) e.target.value = id;
  });
  $("[data-close]", overlay).addEventListener("click", close);
  $("#note-form", overlay).addEventListener("submit", (e) => {
    e.preventDefault();
    const patch = {
      title: $("#nt-title", overlay).value.trim() || null,
      body: $("#nt-body", overlay).value.trim() || null,
      category: $("#nt-cat", overlay).value.trim() || null,
      labels: parseLabels($("#nt-labels", overlay).value),
      color,
      tag_id: $("#nt-tag", overlay).value || null,
    };
    if (!patch.title && !patch.body) { close(); return; } // don't save an empty note
    if (isNew) ins("notes", { ...patch, pinned: false, archived: false, created_at: new Date().toISOString() });
    else upd("notes", n.id, patch);
    close();
    rerender();
  });
}
