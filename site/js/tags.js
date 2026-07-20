// Tags: global company filter + per-record tag select controls.
import { cache, ins, upd, del } from "./db.js";
import { esc, rerender, openModal, $, $$ } from "./ui.js";

const LS_KEY = "rebl.tagFilter";

export function activeTag() {
  const id = localStorage.getItem(LS_KEY) || "";
  return cache.tags.some((t) => t.id === id) ? id : "";
}
export function setActiveTag(id) {
  localStorage.setItem(LS_KEY, id || "");
  rerender();
}
export const tagName = (id) => cache.tags.find((t) => t.id === id)?.name || "";

/** rows visible under the current global filter (untagged only under ALL) */
export function visible(rows) {
  const id = activeTag();
  return id ? rows.filter((r) => r.tag_id === id) : rows;
}

/** "FILTERED · ORBIT" indicator html for page headings */
export function filterBadge() {
  const id = activeTag();
  return id ? `<span class="chip chip--filtered">Filtered · ${esc(tagName(id))}</span>` : "";
}

/** sidebar chips: ALL · REBL · ORBIT · … */
export function filterChipsHtml() {
  const id = activeTag();
  return `
    <div class="tag-filter">
      <button class="chip" data-tagfilter="" aria-pressed="${!id}">All</button>
      ${cache.tags
        .map(
          (t) =>
            `<button class="chip" data-tagfilter="${t.id}" aria-pressed="${id === t.id}">${esc(t.name)}</button>`
        )
        .join("")}
    </div>`;
}
export function wireFilterChips(container) {
  $$("[data-tagfilter]", container).forEach((b) =>
    b.addEventListener("click", () => setActiveTag(b.dataset.tagfilter))
  );
}

/** small tag chip shown on rows */
export function tagChipHtml(tag_id) {
  const n = tagName(tag_id);
  return n ? `<span class="tag-chip">${esc(n)}</span>` : "";
}

/** compact tag <select> for create/edit forms. data-tagsel marks it for wiring. */
export function tagSelectHtml(selectedId, extra = "") {
  const sel = selectedId ?? activeTag() ?? "";
  return `<select class="tag-select" data-tagsel ${extra}>
    <option value="">— no tag</option>
    ${cache.tags
      .map((t) => `<option value="${t.id}" ${t.id === sel ? "selected" : ""}>${esc(t.name)}</option>`)
      .join("")}
    <option value="__new">+ new…</option>
  </select>`;
}

/** handle a tag-select change; returns chosen tag id ('' = none) or null if cancelled */
export function resolveTagChange(selectEl) {
  if (selectEl.value !== "__new") return selectEl.value;
  const name = (prompt("New tag name:") || "").trim();
  if (!name) {
    selectEl.value = "";
    return null;
  }
  const existing = cache.tags.find((t) => t.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  const row = ins("tags", { name });
  return row.id;
}

/** MANAGE TAGS modal: rename / delete / add */
export function manageTagsModal() {
  const { overlay, close } = openModal(`
    <div class="label">Manage tags</div>
    <div class="modal-form">
      ${cache.tags
        .map(
          (t) => `
        <div class="manage-row" data-tag="${t.id}">
          <input class="input" value="${esc(t.name)}" data-rename="${t.id}" />
          <button class="btn btn--danger" data-deltag="${t.id}">Delete</button>
        </div>`
        )
        .join("")}
      <form class="manage-row" id="add-tag-form">
        <input class="input" id="new-tag-name" placeholder="New tag name" />
        <button class="btn" type="submit">Add</button>
      </form>
      <div class="modal-actions"><span style="flex:1"></span><button class="btn btn--primary" data-close>Done</button></div>
    </div>`);
  $("[data-close]", overlay).addEventListener("click", () => {
    close();
    rerender();
  });
  $$("[data-rename]", overlay).forEach((inp) =>
    inp.addEventListener("change", () => {
      const name = inp.value.trim();
      if (name) upd("tags", inp.dataset.rename, { name });
    })
  );
  $$("[data-deltag]", overlay).forEach((b) =>
    b.addEventListener("click", () => {
      const t = cache.tags.find((x) => x.id === b.dataset.deltag);
      if (!confirm(`Delete tag "${t?.name}"? Records keep their data and become untagged.`)) return;
      // FK is on delete set null server-side; mirror locally
      for (const key of ["leads", "content", "tasks", "transactions", "subscriptions", "documents", "journal", "notes", "accounts"])
        cache[key].forEach((r) => {
          if (r.tag_id === b.dataset.deltag) r.tag_id = null;
        });
      del("tags", b.dataset.deltag);
      close();
      manageTagsModal();
    })
  );
  $("#add-tag-form", overlay).addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#new-tag-name", overlay).value.trim();
    if (!name) return;
    ins("tags", { name });
    close();
    manageTagsModal();
  });
}
