// ACCOUNTS — a plain registry of social/web accounts.
// SECURITY: no password field, no secret field, ever (see migration_v3_1.sql).
// Handles and login emails only — passwords live in your password manager.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender } from "../ui.js";
import { visible, filterBadge, activeTag, tagSelectHtml, resolveTagChange } from "../tags.js";

const PLATFORMS = ["LinkedIn", "Twitter", "Instagram", "GitHub", "Website", "Other"];

let chip = ""; // platform filter

export function renderAccounts(main) {
  const all = visible(cache.accounts);
  const counts = {};
  for (const a of all) counts[a.platform] = (counts[a.platform] || 0) + 1;
  const rows = all
    .filter((a) => !chip || a.platform === chip)
    .sort((a, b) => ((a.created_at || "") < (b.created_at || "") ? 1 : -1));

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">registry ${filterBadge()}</div>
        <h1 class="display">Accounts</h1>
      </div>
    </div>
    <div class="toolbar">
      <button class="btn btn--primary" id="add-account">+ Account</button>
      <span class="label">${all.length} account${all.length === 1 ? "" : "s"}</span>
    </div>
    <div class="filter-bar">
      <span class="label">Platform</span>
      <button class="chip" data-chip="" aria-pressed="${!chip}">All · ${all.length}</button>
      ${PLATFORMS.map(
        (p) => `<button class="chip" data-chip="${p}" aria-pressed="${chip === p}">${p} · ${counts[p] || 0}</button>`
      ).join("")}
    </div>
    ${
      rows.length
        ? `<div class="table-wrap"><table class="rebl rebl--tracker"><thead><tr>
            <th class="label-th">Platform</th><th class="label-th">Handle</th><th class="label-th">Profile URL</th>
            <th class="label-th">Login email</th><th class="label-th">Purpose</th><th class="label-th">Tag</th>
            <th class="label-th">Notes</th><th></th>
          </tr></thead><tbody>
          ${rows
            .map(
              (a) => `<tr data-account="${a.id}">
              <td><select class="cell cell--select" data-row="${a.id}" data-f="platform">
                ${[...(PLATFORMS.includes(a.platform) ? PLATFORMS : [a.platform, ...PLATFORMS])]
                  .map((p) => `<option value="${esc(p)}" ${p === a.platform ? "selected" : ""}>${esc(p)}</option>`)
                  .join("")}
              </select></td>
              <td><input class="cell" data-row="${a.id}" data-f="handle" value="${esc(a.handle)}" placeholder="@handle" /></td>
              <td class="link-cell">
                <input class="cell" data-row="${a.id}" data-f="profile_url" value="${esc(a.profile_url || "")}" placeholder="https://" />
                ${a.profile_url ? `<a class="open-link" href="${esc(a.profile_url)}" target="_blank" rel="noopener">Open ↗</a>` : ""}
              </td>
              <td><input class="cell" data-row="${a.id}" data-f="login_email" value="${esc(a.login_email || "")}" placeholder="email" /></td>
              <td><input class="cell" data-row="${a.id}" data-f="purpose" value="${esc(a.purpose || "")}" /></td>
              <td>${tagSelectHtml(a.tag_id || "", `data-row-tag="${a.id}"`)}</td>
              <td><input class="cell" data-row="${a.id}" data-f="notes" value="${esc(a.notes || "")}" /></td>
              <td class="td-del"><button class="icon-btn" data-del-account="${a.id}" title="Delete">×</button></td>
            </tr>`
            )
            .join("")}</tbody></table></div>`
        : `<div class="empty">No accounts${chip ? " on this platform" : ""} yet.<br>
           <span style="font-size:13.5px">Handles and login emails only — passwords live in your password manager.</span></div>`
    }`;

  $("#add-account", main).addEventListener("click", () => {
    const row = ins("social_accounts", {
      platform: chip || "LinkedIn",
      handle: "",
      tag_id: activeTag() || null,
      created_at: new Date().toISOString(),
    });
    setTimeout(() => $(`tr[data-account="${row.id}"] .cell`)?.focus(), 0);
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
      if (id !== null) upd("social_accounts", el.dataset.rowTag, { tag_id: id || null });
      return;
    }
    if (!el.dataset.f) return;
    const notNull = el.dataset.f === "handle" || el.dataset.f === "platform";
    upd("social_accounts", el.dataset.row, { [el.dataset.f]: notNull ? el.value : el.value || null });
  });

  $$("[data-del-account]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this account row?")) return;
      del("social_accounts", b.dataset.delAccount);
    })
  );
}
