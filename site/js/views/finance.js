// FINANCE — month summary, add-transaction row, table + category breakdown.
import { cache, ins, upd, del } from "../db.js";
import { $, $$, esc, rerender, todayStr, monthKey, addMonths, monthLabel, fmtMoney, openModal } from "../ui.js";
import { visible, filterBadge, activeTag, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

const METHODS = ["UPI", "Card", "Cash", "Bank", "Other"];

let finTab = "tx"; // tx | subs
let month = monthKey(todayStr());
let fKind = ""; // '' | income | expense
let fCats = new Set(); // category ids; empty = all
let q = "";

const catName = (id) => cache.categories.find((c) => c.id === id)?.name || "Uncategorized";
const catsOf = (kind) => cache.categories.filter((c) => c.kind === kind);

function monthTx(key = month) {
  return visible(cache.transactions).filter((t) => monthKey(t.occurred_on) === key);
}
function sums(txs) {
  let income = 0, expense = 0;
  for (const t of txs) t.kind === "income" ? (income += +t.amount) : (expense += +t.amount);
  return { income, expense, net: income - expense };
}

function catOptions(kind, selectedId) {
  return `<option value="">Uncategorized</option>
    ${catsOf(kind)
      .map((c) => `<option value="${c.id}" ${c.id === selectedId ? "selected" : ""}>${esc(c.name)}</option>`)
      .join("")}
    <option value="__new">+ new category…</option>`;
}

function resolveCategoryChange(sel, kind) {
  if (sel.value !== "__new") return sel.value || null;
  const name = (prompt("New category name:") || "").trim();
  if (!name) return null;
  const existing = catsOf(kind).find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (existing) return existing.id;
  return ins("finance_categories", { name, kind }).id;
}

const finTabsHtml = () => `
  <div class="filter-bar" style="margin-bottom:18px">
    <button class="chip" data-fintab="tx" aria-pressed="${finTab === "tx"}">Transactions</button>
    <button class="chip" data-fintab="subs" aria-pressed="${finTab === "subs"}">Subscriptions</button>
  </div>`;
function wireFinTabs(main) {
  $$("[data-fintab]", main).forEach((b) =>
    b.addEventListener("click", () => {
      finTab = b.dataset.fintab;
      rerender();
    })
  );
}

export function renderFinance(main) {
  if (finTab === "subs") return renderSubscriptions(main);
  renderTransactions(main);
}

function renderTransactions(main) {
  const txs = monthTx()
    .filter((t) => !fKind || t.kind === fKind)
    .filter((t) => !fCats.size || fCats.has(t.category_id || ""))
    .filter((t) => !q || String(t.note || "").toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (a.occurred_on < b.occurred_on ? 1 : a.occurred_on > b.occurred_on ? -1 : a.created_at < b.created_at ? 1 : -1));
  const s = sums(monthTx());

  // per-category totals for the month
  const byCat = { income: new Map(), expense: new Map() };
  for (const t of monthTx()) {
    const m = byCat[t.kind];
    const k = t.category_id || "";
    m.set(k, (m.get(k) || 0) + Number(t.amount));
  }
  const breakdown = (kind) => {
    const entries = [...byCat[kind].entries()].sort((a, b) => b[1] - a[1]);
    if (!entries.length) return `<p class="muted" style="font-size:13px">None this month.</p>`;
    const max = entries[0][1];
    return entries
      .map(
        ([cid, amt]) => `
        <div class="cat-row">
          <span class="cat-name">${esc(catName(cid))}</span>
          <span class="cat-bar-track"><span class="cat-bar ${kind === "income" ? "cat-bar--income" : ""}" style="width:${Math.max(3, (amt / max) * 100)}%"></span></span>
          <span class="cat-amt">${fmtMoney(amt)}</span>
        </div>`
      )
      .join("");
  };

  const sixMonths = Array.from({ length: 6 }, (_, i) => addMonths(month, -i)).map((key) => ({ key, ...sums(monthTx(key)) }));

  const usedCatIds = [...new Set(monthTx().map((t) => t.category_id || ""))];

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">finance ${filterBadge()}</div>
        <h1 class="display">Finance</h1>
      </div>
      <button class="chip" id="manage-cats">Manage</button>
    </div>
    ${finTabsHtml()}
    <div class="month-head">
      <button class="chip" id="m-prev">‹</button>
      <span class="month-label">${monthLabel(month)}</span>
      <button class="chip" id="m-next">›</button>
    </div>
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat"><span class="label">Income</span><span class="stat-value">${fmtMoney(s.income)}</span></div>
      <div class="stat"><span class="label">Expense</span><span class="stat-value">${fmtMoney(s.expense)}</span></div>
      <div class="stat"><span class="label">Net</span><span class="stat-value ${s.net >= 0 ? "stat-value--brass" : "stat-value--neg"}">${fmtMoney(s.net)}</span></div>
    </div>

    <form class="tx-add" id="tx-add">
      <input class="input" type="date" id="tx-date" value="${todayStr()}" />
      <div class="kind-toggle" role="group">
        <button type="button" class="chip" data-kind="expense" aria-pressed="true">Expense</button>
        <button type="button" class="chip" data-kind="income" aria-pressed="false">Income</button>
      </div>
      <select class="input" id="tx-cat">${catOptions("expense")}</select>
      <input class="input" type="number" step="0.01" min="0.01" id="tx-amount" placeholder="Amount" />
      <select class="input" id="tx-method"><option value="">Method</option>${METHODS.map((m) => `<option>${m}</option>`).join("")}</select>
      <input class="input" id="tx-note" placeholder="Note" />
      ${tagSelectHtml(undefined, 'id="tx-tag"')}
      <button class="btn btn--primary" type="submit">Add</button>
    </form>

    <div class="finance-body">
      <div>
        <div class="filter-bar">
          <button class="chip" data-fkind="" aria-pressed="${!fKind}">All</button>
          <button class="chip" data-fkind="income" aria-pressed="${fKind === "income"}">Income</button>
          <button class="chip" data-fkind="expense" aria-pressed="${fKind === "expense"}">Expense</button>
          <input class="input input--search" id="tx-q" placeholder="Search notes…" value="${esc(q)}" />
        </div>
        ${
          usedCatIds.length > 1
            ? `<div class="filter-bar">
                <span class="label">Category</span>
                ${usedCatIds
                  .map(
                    (cid) =>
                      `<button class="chip" data-fcat="${cid}" aria-pressed="${fCats.has(cid)}">${esc(catName(cid))}</button>`
                  )
                  .join("")}
              </div>`
            : ""
        }
        ${
          txs.length
            ? `<div class="table-wrap"><table class="rebl"><thead><tr>
                <th>Date</th><th>Category</th><th>Note</th><th>Method</th><th style="text-align:right">Amount</th><th></th><th></th>
              </tr></thead><tbody>
              ${txs
                .map(
                  (t) => `<tr data-tx="${t.id}">
                  <td class="cell-dim">${t.occurred_on}</td>
                  <td>${esc(catName(t.category_id))}</td>
                  <td>${esc(t.note || "")} ${tagChipHtml(t.tag_id)}</td>
                  <td class="cell-dim">${esc(t.method || "")}</td>
                  <td class="amount ${t.kind === "expense" ? "amount--neg" : ""}">${t.kind === "expense" ? "−" : ""}${fmtMoney(t.amount, true)}</td>
                  <td><button class="linklike" data-edit-tx="${t.id}">Edit</button></td>
                  <td class="td-del"><button class="icon-btn" data-del-tx="${t.id}" title="Delete">×</button></td>
                </tr>`
                )
                .join("")}</tbody></table></div>`
            : `<div class="empty">No transactions${fKind || q || fCats.size ? " match" : " this month"}.</div>`
        }
      </div>
      <aside>
        <div class="label" style="margin-bottom:10px">Expenses by category</div>
        ${breakdown("expense")}
        <div class="label" style="margin:22px 0 10px">Income by category</div>
        ${breakdown("income")}
        <div class="label" style="margin:26px 0 8px">Last 6 months</div>
        <table class="rebl rebl--mini"><thead><tr><th>Month</th><th>In</th><th>Out</th><th>Net</th></tr></thead><tbody>
          ${sixMonths
            .map(
              (m) =>
                `<tr><td class="cell-dim">${m.key}</td><td>${fmtMoney(m.income)}</td><td>${fmtMoney(m.expense)}</td>
                 <td class="${m.net >= 0 ? "amount--brass" : "amount--neg"}">${fmtMoney(m.net)}</td></tr>`
            )
            .join("")}</tbody></table>
      </aside>
    </div>`;

  wireFinTabs(main);

  /* month switcher */
  $("#m-prev", main).addEventListener("click", () => { month = addMonths(month, -1); rerender(); });
  $("#m-next", main).addEventListener("click", () => { month = addMonths(month, 1); rerender(); });

  /* add row */
  let addKind = "expense";
  $$("#tx-add [data-kind]", main).forEach((b) =>
    b.addEventListener("click", () => {
      addKind = b.dataset.kind;
      $$("#tx-add [data-kind]", main).forEach((x) => x.setAttribute("aria-pressed", x.dataset.kind === addKind));
      $("#tx-cat", main).innerHTML = catOptions(addKind);
    })
  );
  $("#tx-cat", main).addEventListener("change", (e) => {
    const id = resolveCategoryChange(e.target, addKind);
    e.target.innerHTML = catOptions(addKind, id);
    e.target.value = id || "";
  });
  $("#tx-tag", main).addEventListener("change", (e) => {
    const id = resolveTagChange(e.target);
    if (id !== null) e.target.value = id;
  });
  $("#tx-add", main).addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number($("#tx-amount", main).value);
    if (!amount || amount <= 0) return;
    ins("transactions", {
      occurred_on: $("#tx-date", main).value || todayStr(),
      kind: addKind,
      category_id: $("#tx-cat", main).value || null,
      amount,
      method: $("#tx-method", main).value || null,
      note: $("#tx-note", main).value.trim() || null,
      tag_id: $("#tx-tag", main).value || null,
      created_at: new Date().toISOString(),
    });
  });

  /* filters */
  $$("[data-fkind]", main).forEach((b) =>
    b.addEventListener("click", () => { fKind = b.dataset.fkind; rerender(); })
  );
  $$("[data-fcat]", main).forEach((b) =>
    b.addEventListener("click", () => {
      const id = b.dataset.fcat;
      fCats.has(id) ? fCats.delete(id) : fCats.add(id);
      rerender();
    })
  );
  let qTimer;
  $("#tx-q", main).addEventListener("input", (e) => {
    q = e.target.value;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => {
      rerender();
      const inp = $("#tx-q");
      if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
    }, 250);
  });

  /* row actions */
  $$("[data-del-tx]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this transaction?")) return;
      del("transactions", b.dataset.delTx);
    })
  );
  $$("[data-edit-tx]", main).forEach((b) => b.addEventListener("click", () => editTxModal(b.dataset.editTx)));
  $("#manage-cats", main).addEventListener("click", manageCategoriesModal);
}

function editTxModal(id) {
  const t = cache.transactions.find((x) => x.id === id);
  if (!t) return;
  const { overlay, close } = openModal(`
    <div class="label">Edit transaction</div>
    <form class="modal-form" id="etx-form">
      <input class="input" type="date" id="etx-date" value="${t.occurred_on}" />
      <select class="input" id="etx-kind">
        <option value="expense" ${t.kind === "expense" ? "selected" : ""}>Expense</option>
        <option value="income" ${t.kind === "income" ? "selected" : ""}>Income</option>
      </select>
      <select class="input" id="etx-cat">${catOptions(t.kind, t.category_id)}</select>
      <input class="input" type="number" step="0.01" min="0.01" id="etx-amount" value="${t.amount}" />
      <select class="input" id="etx-method"><option value="">Method</option>${METHODS.map((m) => `<option ${t.method === m ? "selected" : ""}>${m}</option>`).join("")}</select>
      <input class="input" id="etx-note" value="${esc(t.note || "")}" placeholder="Note" />
      ${tagSelectHtml(t.tag_id || "", 'id="etx-tag"')}
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary">Save</button>
      </div>
    </form>`);
  $("[data-close]", overlay).addEventListener("click", close);
  $("#etx-kind", overlay).addEventListener("change", (e) => {
    $("#etx-cat", overlay).innerHTML = catOptions(e.target.value);
  });
  $("#etx-cat", overlay).addEventListener("change", (e) => {
    const kind = $("#etx-kind", overlay).value;
    const cid = resolveCategoryChange(e.target, kind);
    e.target.innerHTML = catOptions(kind, cid);
    e.target.value = cid || "";
  });
  $("#etx-tag", overlay).addEventListener("change", (e) => {
    const id2 = resolveTagChange(e.target);
    if (id2 !== null) e.target.value = id2;
  });
  $("#etx-form", overlay).addEventListener("submit", (e) => {
    e.preventDefault();
    const amount = Number($("#etx-amount", overlay).value);
    if (!amount || amount <= 0) return;
    upd("transactions", id, {
      occurred_on: $("#etx-date", overlay).value,
      kind: $("#etx-kind", overlay).value,
      category_id: $("#etx-cat", overlay).value || null,
      amount,
      method: $("#etx-method", overlay).value || null,
      note: $("#etx-note", overlay).value.trim() || null,
      tag_id: $("#etx-tag", overlay).value || null,
    });
    close();
  });
}

function manageCategoriesModal() {
  const { overlay, close } = openModal(`
    <div class="label">Manage categories</div>
    <div class="modal-form">
      ${["expense", "income"]
        .map(
          (kind) => `
        <div class="label" style="margin-top:6px">${kind}</div>
        ${catsOf(kind)
          .map(
            (c) => `<div class="manage-row">
              <input class="input" value="${esc(c.name)}" data-rename-cat="${c.id}" />
              <button class="btn btn--danger" data-del-cat="${c.id}">Delete</button>
            </div>`
          )
          .join("") || '<p class="muted" style="font-size:13px">None yet.</p>'}`
        )
        .join("")}
      <form class="manage-row" id="add-cat-form">
        <input class="input" id="new-cat-name" placeholder="New category" />
        <select class="input" id="new-cat-kind" style="max-width:130px">
          <option value="expense">Expense</option><option value="income">Income</option>
        </select>
        <button class="btn" type="submit">Add</button>
      </form>
      <div class="modal-actions"><span style="flex:1"></span><button class="btn btn--primary" data-close>Done</button></div>
    </div>`);
  $("[data-close]", overlay).addEventListener("click", () => { close(); rerender(); });
  $$("[data-rename-cat]", overlay).forEach((inp) =>
    inp.addEventListener("change", () => {
      const name = inp.value.trim();
      if (name) upd("finance_categories", inp.dataset.renameCat, { name });
    })
  );
  $$("[data-del-cat]", overlay).forEach((b) =>
    b.addEventListener("click", () => {
      const c = cache.categories.find((x) => x.id === b.dataset.delCat);
      if (!confirm(`Delete category "${c?.name}"? Transactions keep their rows and become Uncategorized.`)) return;
      cache.transactions.forEach((t) => { if (t.category_id === b.dataset.delCat) t.category_id = null; });
      del("finance_categories", b.dataset.delCat);
      close();
      manageCategoriesModal();
    })
  );
  $("#add-cat-form", overlay).addEventListener("submit", (e) => {
    e.preventDefault();
    const name = $("#new-cat-name", overlay).value.trim();
    if (!name) return;
    ins("finance_categories", { name, kind: $("#new-cat-kind", overlay).value });
    close();
    manageCategoriesModal();
  });
}

/* ================= SUBSCRIPTIONS tab ================= */

const fmtCur = (n, cur, dec = false) =>
  new Intl.NumberFormat(cur === "USD" ? "en-US" : "en-IN", {
    style: "currency",
    currency: cur || "INR",
    maximumFractionDigits: dec ? 2 : 0,
  }).format(Number(n) || 0);

function subRow(s, cancelled = false) {
  const sel = (field, options) => `<select class="cell cell--select" data-row="${s.id}" data-f="${field}">
    ${options.map((o) => `<option value="${esc(o)}" ${o === (s[field] || "") ? "selected" : ""}>${esc(o)}</option>`).join("")}
  </select>`;
  return `<tr data-sub="${s.id}" class="${cancelled ? "sub-cancelled" : ""}">
    <td><input class="cell" data-row="${s.id}" data-f="name" value="${esc(s.name)}" /></td>
    <td class="sub-amount-cell">
      <input class="cell" type="number" step="0.01" min="0.01" data-row="${s.id}" data-f="amount" value="${s.amount}" style="max-width:90px" />
      ${sel("currency", ["INR", "USD"])}
    </td>
    <td>${sel("cycle", ["monthly", "yearly"])}</td>
    <td><input class="cell" type="date" data-row="${s.id}" data-f="next_renewal" value="${s.next_renewal || ""}" /></td>
    <td>${sel("method", ["", ...METHODS])}</td>
    <td><button class="chip" data-substatus="${s.id}" aria-pressed="${!cancelled}">${cancelled ? "Cancelled" : "Active"}</button></td>
    <td>${tagSelectHtml(s.tag_id || "", `data-row-tag="${s.id}"`)}</td>
    <td><input class="cell" data-row="${s.id}" data-f="notes" value="${esc(s.notes || "")}" /></td>
    <td class="td-del"><button class="icon-btn" data-del-sub="${s.id}" title="Delete">×</button></td>
  </tr>`;
}

const SUB_HEAD = `<thead><tr>
  <th class="label-th">Name</th><th class="label-th">Amount</th><th class="label-th">Cycle</th>
  <th class="label-th">Next renewal</th><th class="label-th">Method</th><th class="label-th">Status</th>
  <th class="label-th">Tag</th><th class="label-th">Notes</th><th></th>
</tr></thead>`;

function renderSubscriptions(main) {
  const all = visible(cache.subscriptions);
  const bySort = (a, b) => ((a.next_renewal || "9999") > (b.next_renewal || "9999") ? 1 : -1);
  const active = all.filter((s) => s.status !== "cancelled").sort(bySort);
  const cancelled = all.filter((s) => s.status === "cancelled").sort(bySort);

  const perMonth = { INR: 0, USD: 0 };
  for (const s of active) perMonth[s.currency || "INR"] += s.cycle === "yearly" ? Number(s.amount) / 12 : Number(s.amount);
  const monthLines = ["INR", "USD"].filter((c) => perMonth[c] > 0);
  const next = active.filter((s) => s.next_renewal && s.next_renewal >= todayStr()).sort(bySort)[0];

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">finance ${filterBadge()}</div>
        <h1 class="display">Finance</h1>
      </div>
    </div>
    ${finTabsHtml()}
    <div class="stat-grid" style="margin-bottom:24px">
      <div class="stat">
        <span class="label">Recurring / mo</span>
        ${
          monthLines.length
            ? monthLines
                .map((c, i) => `<span class="${i === 0 ? "stat-value" : "stat-value stat-value--second"}">${fmtCur(perMonth[c], c)}</span>`)
                .join("")
            : `<span class="stat-value">—</span>`
        }
        <span class="stat-caption">active monthly + yearly ÷ 12</span>
      </div>
      <div class="stat">
        <span class="label">Next renewal</span>
        <span class="stat-value" style="font-size:1.6rem;line-height:1.2">${next ? esc(next.name) : "—"}</span>
        <span class="stat-caption">${next ? `${next.next_renewal} · ${fmtCur(next.amount, next.currency)}` : "nothing scheduled"}</span>
      </div>
      <div class="stat">
        <span class="label">Active</span>
        <span class="stat-value">${active.length}</span>
        <span class="stat-caption">${cancelled.length ? `${cancelled.length} cancelled` : "subscriptions"}</span>
      </div>
    </div>
    <div class="toolbar"><button class="btn btn--primary" id="add-sub">+ Subscription</button></div>
    ${
      active.length
        ? `<div class="table-wrap"><table class="rebl rebl--tracker">${SUB_HEAD}<tbody>
           ${active.map((s) => subRow(s)).join("")}</tbody></table></div>`
        : `<div class="empty">No active subscriptions. Enjoy it while it lasts.</div>`
    }
    ${
      cancelled.length
        ? `<details class="done-block"><summary class="label">Cancelled · ${cancelled.length}</summary>
           <div class="table-wrap"><table class="rebl rebl--tracker">${SUB_HEAD}<tbody>
           ${cancelled.map((s) => subRow(s, true)).join("")}</tbody></table></div></details>`
        : ""
    }
    <p class="muted" style="font-size:13px;margin-top:20px">
      Renewals are logged manually in Transactions when paid — the subscription row is the reference, the transaction is the record.
    </p>`;

  wireFinTabs(main);

  $("#add-sub", main).addEventListener("click", () => {
    const row = ins("subscriptions", {
      name: "",
      amount: 1,
      currency: "INR",
      cycle: "monthly",
      status: "active",
      tag_id: activeTag() || null,
      created_at: new Date().toISOString(),
    });
    setTimeout(() => $(`tr[data-sub="${row.id}"] .cell`)?.focus(), 0);
  });

  // delegate on the freshly-rendered table wrappers (never on the persistent #main)
  const onSubChange = (e) => {
    const el = e.target;
    if (!el.closest("[data-sub]")) return;
    if (el.dataset.rowTag !== undefined) {
      const id = resolveTagChange(el);
      if (id !== null) upd("subscriptions", el.dataset.rowTag, { tag_id: id || null });
      return;
    }
    if (!el.dataset.f) return;
    let val = el.value;
    if (el.dataset.f === "amount") {
      val = Number(val);
      if (!val || val <= 0) return;
    } else if (el.dataset.f !== "name" && el.dataset.f !== "currency" && el.dataset.f !== "cycle") {
      val = val || null;
    }
    upd("subscriptions", el.dataset.row, { [el.dataset.f]: val });
  };
  $$(".table-wrap", main).forEach((w) => w.addEventListener("change", onSubChange));

  $$("[data-substatus]", main).forEach((b) =>
    b.addEventListener("click", () => {
      const s = cache.subscriptions.find((x) => x.id === b.dataset.substatus);
      if (s) upd("subscriptions", s.id, { status: s.status === "cancelled" ? "active" : "cancelled" });
    })
  );
  $$("[data-del-sub]", main).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this subscription row?")) return;
      del("subscriptions", b.dataset.delSub);
    })
  );
}
