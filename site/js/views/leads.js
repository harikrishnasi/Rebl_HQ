// LEADS — same behavior as v2's tracker, backed by the leads table.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr } from "../ui.js";
import { visible, filterBadge, tagSelectHtml, resolveTagChange } from "../tags.js";

export const STAGES = ["Shortlist", "Reached out", "Replied", "Meeting", "Follow up", "Signed", "Passed"];
const SEGMENTS = ["Brewery", "Club", "Sneaker", "Cafe", "Gym", "Other"];

let chip = ""; // stage filter
let q = ""; // text filter

function cellSelect(lead, field, options, cls = "cell cell--select") {
  const v = lead[field] || "";
  const opts = [...options];
  if (v && !opts.includes(v)) opts.unshift(v);
  const ramp = field === "stage" ? `data-stage="${esc(v)}"` : "";
  return `<select class="${cls}" data-row="${lead.id}" data-f="${field}" ${ramp}>
    <option value=""></option>
    ${opts.map((o) => `<option value="${esc(o)}" ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}
  </select>`;
}

export function renderLeads(main) {
  const rows = visible(cache.leads)
    .filter((l) => !chip || l.stage === chip)
    .filter((l) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return ["name", "contact", "segment", "notes", "stage"].some((f) =>
        String(l[f] || "").toLowerCase().includes(s)
      );
    })
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const all = visible(cache.leads);
  const counts = {};
  for (const l of all) counts[l.stage] = (counts[l.stage] || 0) + 1;

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
      ${STAGES.map(
        (s) => `<button class="chip" data-chip="${s}" aria-pressed="${chip === s}">${s} · ${counts[s] || 0}</button>`
      ).join("")}
    </div>
    ${
      rows.length
        ? `<div class="table-wrap"><table class="rebl rebl--tracker"><thead><tr>
            <th class="label-th">Name</th><th class="label-th">Stage</th><th class="label-th">Contact</th>
            <th class="label-th">Segment</th><th class="label-th">Reach out on</th>
            <th class="label-th">Follow up on</th><th class="label-th">Notes</th><th class="label-th">Tag</th><th></th>
          </tr></thead><tbody>
          ${rows
            .map(
              (l) => `<tr data-lead="${l.id}">
              <td><input class="cell" data-row="${l.id}" data-f="name" value="${esc(l.name)}" /></td>
              <td>${cellSelect(l, "stage", STAGES)}</td>
              <td><input class="cell" data-row="${l.id}" data-f="contact" value="${esc(l.contact || "")}" /></td>
              <td>${cellSelect(l, "segment", SEGMENTS)}</td>
              <td><input class="cell" type="date" data-row="${l.id}" data-f="reach_out_on" value="${l.reach_out_on || ""}" /></td>
              <td><input class="cell" type="date" data-row="${l.id}" data-f="follow_up_on" value="${l.follow_up_on || ""}" /></td>
              <td><input class="cell" data-row="${l.id}" data-f="notes" value="${esc(l.notes || "")}" /></td>
              <td>${tagSelectHtml(l.tag_id || "", `data-lead-tag="${l.id}"`)}</td>
              <td class="td-del"><button class="icon-btn" data-del-lead="${l.id}" title="Delete">×</button></td>
            </tr>`
            )
            .join("")}</tbody></table></div>`
        : `<div class="empty">No leads${chip || q ? " match" : " yet. The list is the company"}.</div>`
    }`;

  $("#add-lead", main).addEventListener("click", () => {
    const row = ins("leads", {
      name: "",
      stage: chip && chip !== "Passed" ? chip : "Shortlist",
      created_at: new Date().toISOString(),
    });
    setTimeout(() => $(`tr[data-lead="${row.id}"] .cell`)?.focus(), 0);
  });

  let qTimer;
  $("#lead-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#lead-q");
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

  // inline edits persist on change (i.e. blur for text inputs)
  const tbody = $("tbody", main);
  tbody?.addEventListener("change", (e) => {
    const el = e.target;
    if (el.dataset.leadTag !== undefined) {
      const id = resolveTagChange(el);
      if (id !== null) upd("leads", el.dataset.leadTag, { tag_id: id || null });
      return;
    }
    if (!el.dataset.f) return;
    // name is NOT NULL — keep empty string; other fields prefer null when cleared
    upd("leads", el.dataset.row, { [el.dataset.f]: el.dataset.f === "name" ? el.value : el.value || null });
  });

  $$("[data-del-lead]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this lead?")) return;
      del("leads", b.dataset.delLead);
    })
  );
}
