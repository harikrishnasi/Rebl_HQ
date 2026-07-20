// TASKS — recurrence engine + view (Today · Weekly · Monthly · Custom · Completed).
import { cache, ins, upd, del } from "../db.js";
import {
  $, $$, esc, rerender, todayStr, addDays, diffDays, fromStr, toStr,
  weekStart, clampedDayInMonth, monthKey,
} from "../ui.js";
import { visible, filterBadge, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

/* ================= recurrence engine ================= */

const comps = (taskId) => cache.completions.filter((c) => c.task_id === taskId);

/** the period of a recurring task containing `day`: {start, end, scheduled} */
export function periodOf(task, day) {
  const anchor = task.anchor_date || day;
  if (task.recurrence === "daily") return { start: day, end: day, scheduled: day };
  if (task.recurrence === "weekly") {
    const ws = weekStart(day);
    const offset = diffDays(weekStart(anchor), anchor); // anchor weekday, Mon=0
    return { start: ws, end: addDays(ws, 6), scheduled: addDays(ws, offset) };
  }
  if (task.recurrence === "monthly") {
    const d = fromStr(day);
    const start = toStr(new Date(d.getFullYear(), d.getMonth(), 1));
    const end = toStr(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const anchorDay = fromStr(anchor).getDate();
    return { start, end, scheduled: clampedDayInMonth(day, anchorDay) };
  }
  if (task.recurrence === "custom") {
    const n = Math.max(1, task.interval_days || 1);
    if (day < anchor) return null;
    const idx = Math.floor(diffDays(anchor, day) / n);
    const start = addDays(anchor, idx * n);
    return { start, end: addDays(start, n - 1), scheduled: start };
  }
  return null;
}

export function completionInPeriod(task, period) {
  if (!period) return null;
  return comps(task.id).find((c) => c.completed_on >= period.start && c.completed_on <= period.end) || null;
}

/** is this task due today (not yet completed for the current period)? */
export function isDueToday(task, day = todayStr()) {
  if (task.archived) return false;
  if (task.recurrence === "once")
    return comps(task.id).length === 0 && (task.due_date || day) <= day;
  if ((task.anchor_date || day) > day) return false;
  const p = periodOf(task, day);
  if (!p) return false;
  return day >= p.scheduled && !completionInPeriod(task, p);
}

/** currently checked (completed for the current period / at all for once)? */
export function isCheckedNow(task, day = todayStr()) {
  if (task.recurrence === "once") return comps(task.id).length > 0;
  return !!completionInPeriod(task, periodOf(task, day));
}

/** next date the task will be due, for the Weekly/Monthly/Custom lists */
export function nextDue(task, day = todayStr()) {
  if (task.recurrence === "once") return comps(task.id).length ? null : task.due_date || day;
  if ((task.anchor_date || day) > day) return task.anchor_date;
  const p = periodOf(task, day);
  if (!p) return task.anchor_date;
  if (!completionInPeriod(task, p)) return p.scheduled <= day ? day : p.scheduled;
  const nextStart = addDays(p.end, 1);
  const np = periodOf(task, nextStart);
  return np ? np.scheduled : nextStart;
}

/** consecutive completed periods, counting back from the current one */
export function streak(task, day = todayStr()) {
  if (task.recurrence === "once") return 0;
  let count = 0;
  let d = day;
  for (let i = 0; i < 400; i++) {
    const p = periodOf(task, d);
    if (!p) break;
    const done = !!completionInPeriod(task, p);
    if (i === 0 && !done) {
      // current period not yet completed — streak counts from the previous one
    } else if (done) {
      count++;
    } else {
      break;
    }
    d = addDays(p.start, -1);
    if (d < (task.anchor_date || "0000")) break;
  }
  return count;
}

/** everything due today (across recurrences) + items already checked today */
export function todayList(day = todayStr()) {
  return visible(cache.tasks).filter((t) => {
    if (t.archived) return false;
    if (isDueToday(t, day)) return true;
    // show as checked if its completion for the current period happened today
    if (t.recurrence === "once") return comps(t.id).some((c) => c.completed_on === day);
    const c = completionInPeriod(t, periodOf(t, day));
    return !!c && c.completed_on === day;
  });
}

export function toggleTask(task, day = todayStr()) {
  if (isCheckedNow(task, day)) {
    const c =
      task.recurrence === "once"
        ? comps(task.id)[0]
        : completionInPeriod(task, periodOf(task, day));
    if (c) del("task_completions", c.id);
  } else {
    ins("task_completions", { task_id: task.id, completed_on: day });
  }
}

/* ================= view ================= */

let tab = "today";
const REC_LABEL = { once: "", daily: "daily", weekly: "weekly", monthly: "monthly", custom: "" };

function taskRow(t) {
  const checked = isCheckedNow(t);
  const recLabel =
    t.recurrence === "custom" ? `every ${t.interval_days}d` : REC_LABEL[t.recurrence];
  return `
    <li class="task ${checked ? "task--done" : ""}">
      <button class="task-box" data-toggle="${t.id}" aria-label="Toggle"></button>
      <span class="task-text">${esc(t.title)}</span>
      ${recLabel ? `<span class="badge">${recLabel}</span>` : ""}
      ${t.recurrence === "once" && t.due_date && t.due_date > todayStr() ? `<span class="doc-row-date">${t.due_date}</span>` : ""}
      ${tagChipHtml(t.tag_id)}
      ${
        t.recurrence === "once"
          ? `<button class="icon-btn" data-del-task="${t.id}" title="Delete">×</button>`
          : `<button class="linklike" data-archive="${t.id}">Archive</button>`
      }
    </li>`;
}

export function renderTasks(main) {
  const day = todayStr();
  const all = visible(cache.tasks).filter((t) => !t.archived);
  const due = todayList(day);
  const later = all.filter(
    (t) => t.recurrence === "once" && comps(t.id).length === 0 && t.due_date && t.due_date > day
  );
  const recTab = (rec) => all.filter((t) => t.recurrence === rec);
  const completions = visible(
    cache.completions
      .map((c) => ({ ...c, task: cache.tasks.find((t) => t.id === c.task_id) }))
      .filter((c) => c.task)
      .map((c) => ({ ...c, tag_id: c.task.tag_id }))
  ).sort((a, b) => (a.completed_on < b.completed_on ? 1 : -1));
  const archived = visible(cache.tasks).filter((t) => t.archived);

  const tabs = ["today", "weekly", "monthly", "custom", "completed"];
  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">tasks ${filterBadge()}</div>
        <h1 class="display">Tasks</h1>
      </div>
    </div>
    <form class="task-addbar" id="task-add">
      <input class="input" id="ta-title" placeholder="Add a task…" autocomplete="off" />
      <select class="input" id="ta-rec">
        <option value="once">Once</option>
        <option value="daily">Daily</option>
        <option value="weekly">Weekly</option>
        <option value="monthly">Monthly</option>
        <option value="custom">Every N days</option>
      </select>
      <input class="input" type="date" id="ta-date" title="Due date" value="${day}" />
      <input class="input" type="number" id="ta-n" min="2" value="3" title="Every N days" hidden style="max-width:80px" />
      ${tagSelectHtml(undefined, 'id="ta-tag"')}
      <button class="btn btn--primary" type="submit">Add</button>
    </form>
    <div class="filter-bar">
      ${tabs
        .map(
          (t) =>
            `<button class="chip" data-tab="${t}" aria-pressed="${tab === t}">${t}${
              t === "today" ? ` · ${due.filter((x) => isDueToday(x)).length}` : ""
            }</button>`
        )
        .join("")}
    </div>
    <div id="task-body">
      ${
        tab === "today"
          ? `${
              due.length
                ? `<ul class="task-list">${due.map(taskRow).join("")}</ul>`
                : `<div class="empty">Nothing due today.</div>`
            }
            ${
              later.length
                ? `<div class="label" style="margin:24px 0 8px">Later</div>
                   <ul class="task-list">${later.map(taskRow).join("")}</ul>`
                : ""
            }`
          : tab === "completed"
          ? `${
              completions.length
                ? `<table class="rebl"><thead><tr><th>Date</th><th>Task</th><th></th></tr></thead><tbody>
                   ${completions
                     .slice(0, 200)
                     .map(
                       (c) => `<tr><td class="cell-dim">${c.completed_on}</td><td>${esc(c.task.title)}</td><td>${tagChipHtml(c.task.tag_id)}</td></tr>`
                     )
                     .join("")}</tbody></table>`
                : `<div class="empty">No completions yet.</div>`
            }
            ${
              archived.length
                ? `<div class="label" style="margin:28px 0 8px">Archived</div>
                   <ul class="task-list">${archived
                     .map(
                       (t) => `<li class="task"><span class="task-text muted">${esc(t.title)}</span>
                         <span class="badge">${t.recurrence}</span>
                         <button class="linklike" data-unarchive="${t.id}">Restore</button>
                         <button class="icon-btn" data-del-task="${t.id}" title="Delete">×</button></li>`
                     )
                     .join("")}</ul>`
                : ""
            }`
          : `${
              recTab(tab).length
                ? `<table class="rebl"><thead><tr><th>Task</th><th>Next due</th><th>Streak</th><th></th><th></th></tr></thead><tbody>
                   ${recTab(tab)
                     .map(
                       (t) => `<tr>
                         <td class="cell-strong">${esc(t.title)}</td>
                         <td class="cell-dim">${nextDue(t) === day ? "today" : nextDue(t) || "—"}</td>
                         <td class="cell-dim">${streak(t)} ${streak(t) === 1 ? "period" : "periods"}</td>
                         <td>${tagChipHtml(t.tag_id)}</td>
                         <td class="td-del"><button class="linklike" data-archive="${t.id}">Archive</button></td>
                       </tr>`
                     )
                     .join("")}</tbody></table>`
                : `<div class="empty">No ${tab} tasks.</div>`
            }`
      }
    </div>`;

  // add bar
  $("#ta-rec", main).addEventListener("change", (e) => {
    $("#ta-date", main).hidden = e.target.value !== "once";
    $("#ta-n", main).hidden = e.target.value !== "custom";
  });
  $("#ta-tag", main).addEventListener("change", (e) => {
    const id = resolveTagChange(e.target);
    if (id !== null) e.target.value = id;
  });
  $("#task-add", main).addEventListener("submit", (e) => {
    e.preventDefault();
    const title = $("#ta-title", main).value.trim();
    if (!title) return;
    const recurrence = $("#ta-rec", main).value;
    const row = {
      title,
      recurrence,
      anchor_date: todayStr(),
      archived: false,
      tag_id: $("#ta-tag", main).value || null,
    };
    if (recurrence === "once") row.due_date = $("#ta-date", main).value || todayStr();
    if (recurrence === "custom") row.interval_days = Math.max(2, Number($("#ta-n", main).value) || 2);
    ins("tasks", row);
  });

  $$("[data-tab]", main).forEach((b) =>
    b.addEventListener("click", () => {
      tab = b.dataset.tab;
      rerender();
    })
  );
  wireTaskListEvents(main);
}

export function wireTaskListEvents(root) {
  $$("[data-toggle]", root).forEach((b) =>
    b.addEventListener("click", () => {
      const t = cache.tasks.find((x) => x.id === b.dataset.toggle);
      if (t) toggleTask(t);
    })
  );
  $$("[data-del-task]", root).forEach((b) =>
    b.addEventListener("click", () => {
      if (!confirm("Delete this task?")) return;
      cache.completions
        .filter((c) => c.task_id === b.dataset.delTask)
        .forEach((c) => del("task_completions", c.id));
      del("tasks", b.dataset.delTask);
    })
  );
  $$("[data-archive]", root).forEach((b) =>
    b.addEventListener("click", () => upd("tasks", b.dataset.archive, { archived: true }))
  );
  $$("[data-unarchive]", root).forEach((b) =>
    b.addEventListener("click", () => upd("tasks", b.dataset.unarchive, { archived: false }))
  );
}
