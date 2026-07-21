// CONTENT — posts pipeline (Idea → Drafted → Scheduled → Posted). Leads-mirror.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr, safeUrl } from "../ui.js";
import { visible, filterBadge, activeTag, tagSelectHtml, resolveTagChange } from "../tags.js";

export const CONTENT_STATUSES = ["Idea", "Drafted", "Scheduled", "Posted"];
const CHANNELS = ["LinkedIn", "Twitter", "Instagram", "Blog", "Other"];

let chip = ""; // status filter
let channel = ""; // secondary filter
let q = "";

function cellSelect(row, field, options) {
  const v = row[field] || "";
  const opts = [...options];
  if (v && !opts.includes(v)) opts.unshift(v);
  const ramp = field === "status" ? `data-status="${esc(v)}"` : "";
  return `<select class="cell cell--select" data-row="${row.id}" data-f="${field}" ${ramp}>
    ${opts.map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}
  </select>`;
}

/** publish_on ascending with nulls last; Posted view descending */
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
        return ["title", "notes", "link", "channel", "status"].some((f) =>
          String(c[f] || "").toLowerCase().includes(s)
        );
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
      <button class="btn btn--primary" id="add-content">+ Row</button>
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
      ${CONTENT_STATUSES.map(
        (s) => `<button class="chip" data-chip="${s}" aria-pressed="${chip === s}">${s} · ${counts[s] || 0}</button>`
      ).join("")}
    </div>
    ${
      rows.length
        ? `<div class="table-wrap"><table class="rebl rebl--tracker"><thead><tr>
            <th class="label-th">Title</th><th class="label-th">Channel</th><th class="label-th">Status</th>
            <th class="label-th">Publish on</th><th class="label-th">Link</th><th class="label-th">Tag</th>
            <th class="label-th">Notes</th><th></th>
          </tr></thead><tbody>
          ${rows
            .map(
              (c) => `<tr data-content="${c.id}">
              <td><input class="cell" data-row="${c.id}" data-f="title" value="${esc(c.title)}" /></td>
              <td>${cellSelect(c, "channel", CHANNELS)}</td>
              <td>${cellSelect(c, "status", CONTENT_STATUSES)}</td>
              <td><input class="cell" type="date" data-row="${c.id}" data-f="publish_on" value="${c.publish_on || ""}" /></td>
              <td class="link-cell">
                <input class="cell" data-row="${c.id}" data-f="link" value="${esc(c.link || "")}" placeholder="https://" />
                ${safeUrl(c.link) ? `<a class="open-link" href="${esc(safeUrl(c.link))}" target="_blank" rel="noopener noreferrer">Open ↗</a>` : ""}
              </td>
              <td>${tagSelectHtml(c.tag_id || "", `data-row-tag="${c.id}"`)}</td>
              <td><input class="cell" data-row="${c.id}" data-f="notes" value="${esc(c.notes || "")}" /></td>
              <td class="td-del"><button class="icon-btn" data-del-content="${c.id}" title="Delete">×</button></td>
            </tr>`
            )
            .join("")}</tbody></table></div>`
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
    setTimeout(() => $(`tr[data-content="${row.id}"] .cell`)?.focus(), 0);
  });

  $("#content-channel", main).addEventListener("change", (e) => {
    channel = e.target.value;
    rerender();
  });

  let qTimer;
  $("#content-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#content-q");
      if (inp) {
        inp.focus();
        inp.setSelectionRange(inp.value.length, inp.value.length);
      }
    }, 250);
  });

  $$("[data-chip]", main).forEach((b) =>
    b.addEventListener("click", () => {
      chip = b.dataset.chip;
      rerender();
    })
  );

  const tbody = $("tbody", main);
  tbody?.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.rowTag !== undefined) {
      const id = resolveTagChange(el);
      if (id !== null) upd("content_items", el.dataset.rowTag, { tag_id: id || null });
      return;
    }
    if (!el.dataset.f) return;
    upd("content_items", el.dataset.row, { [el.dataset.f]: el.dataset.f === "title" ? el.value : el.value || null });
  });

  $$("[data-del-content]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this content item?")) return;
      del("content_items", b.dataset.delContent);
    })
  );
}
