// HOME — the glanceable dashboard: mission, KPI tiles, today's tasks, journal, follow-ups.
import { cache, setSetting } from "../db.js";
import { $, esc, todayStr, addDays, weekStart, weekEnd, monthKey, fmtMoney } from "../ui.js";
import { excerpt } from "../md.js";
import { visible, filterBadge } from "../tags.js";
import { todayList, wireTaskListEvents, isCheckedNow } from "./tasks.js";
import { STAGES } from "./leads.js";
import { QUOTES } from "../quotes.js";

let quoteOffset = 0; // click-to-advance within a session; base rotates daily

export function renderHome(main) {
  const day = todayStr();
  const leads = visible(cache.leads);
  const stageCounts = STAGES.map((s) => [s, leads.filter((l) => l.stage === s).length]).filter(([, n]) => n > 0);

  const ws = weekStart(day), we = weekEnd(day);
  const outreach = leads.filter((l) => l.reach_out_on && l.reach_out_on >= ws && l.reach_out_on <= we);

  const todays = todayList(day);
  const doneCount = todays.filter((t) => isCheckedNow(t, day)).length;

  const mk = monthKey(day);
  let income = 0, expense = 0;
  for (const t of visible(cache.transactions))
    if (monthKey(t.occurred_on) === mk) t.kind === "income" ? (income += +t.amount) : (expense += +t.amount);
  const net = income - expense;

  const latestEntry = visible(cache.journal).sort((a, b) => (a.entry_date < b.entry_date ? 1 : -1))[0];
  const followUps = leads
    .filter((l) => l.follow_up_on && l.follow_up_on <= addDays(day, 2))
    .sort((a, b) => (a.follow_up_on > b.follow_up_on ? 1 : -1));

  const posted = visible(cache.content).filter(
    (c) => c.status === "Posted" && c.publish_on && c.publish_on >= ws && c.publish_on <= we
  );
  const queue = visible(cache.content)
    .filter((c) => c.status === "Scheduled" || c.status === "Drafted")
    .sort((a, b) => ((a.publish_on || "9999") > (b.publish_on || "9999") ? 1 : -1))
    .slice(0, 3);
  const renewals = visible(cache.subscriptions)
    .filter((s) => s.status !== "cancelled" && s.next_renewal && s.next_renewal >= day && s.next_renewal <= addDays(day, 7))
    .sort((a, b) => (a.next_renewal > b.next_renewal ? 1 : -1));
  const fmtSub = (s) =>
    new Intl.NumberFormat(s.currency === "USD" ? "en-US" : "en-IN", {
      style: "currency", currency: s.currency || "INR", maximumFractionDigits: 0,
    }).format(s.amount);

  const dayNumber = Math.floor(Date.now() / 86400000); // rotates the quote daily
  const quote = QUOTES[(dayNumber + quoteOffset) % QUOTES.length];

  const now = new Date();
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" }).toUpperCase();
  const monthName = now.toLocaleDateString("en-GB", { month: "long" }).toUpperCase();
  const bigDate = `${weekday} · ${monthName} ${now.getDate()}`;

  main.innerHTML = `
  <div class="home">
    <header class="home-head">
      <div class="label">Rebl HQ ${filterBadge()}</div>
      <h1 class="display display--xl">${bigDate}</h1>
      <input class="mission-input" id="mission" value="${esc(cache.settings.mission || "")}"
        placeholder="Write the mission line — the one sentence this quarter answers to" />
    </header>

    <div class="stat-grid">
      <a class="stat" href="#/leads">
        <span class="label">Pipeline</span>
        <span class="stat-value">${leads.length}</span>
        <span class="stat-caption">${
          stageCounts.length
            ? stageCounts.slice(0, 3).map(([s, n]) => `${s} ${n}`).join(" · ")
            : "No leads yet — the list is the company"
        }</span>
      </a>
      <a class="stat stat--brass" href="#/leads">
        <span class="label">Outreach this week</span>
        <span class="stat-value">${outreach.length}</span>
        <span class="stat-caption">${outreach.length ? "reach-outs planned this week" : "None planned — pick 5"}</span>
      </a>
      <a class="stat stat--brass" href="#/content">
        <span class="label">Posted this week</span>
        <span class="stat-value">${posted.length}</span>
        <span class="stat-caption">${posted.length ? "pieces out this week" : "Nothing posted yet — ship one"}</span>
      </a>
      <a class="stat" href="#/tasks">
        <span class="label">Tasks today</span>
        <span class="stat-value">${doneCount}<span class="stat-value-dim">/${todays.length}</span></span>
        <span class="stat-caption">${
          todays.length === 0 ? "Nothing scheduled" : todays.length - doneCount === 0 ? "All done" : `${todays.length - doneCount} still open`
        }</span>
      </a>
      <a class="stat" href="#/finance">
        <span class="label">This month</span>
        <span class="stat-value ${net > 0 ? "stat-value--brass" : net < 0 ? "stat-value--neg" : ""}">${fmtMoney(net)}</span>
        <span class="stat-caption">${fmtMoney(income)} in · ${fmtMoney(expense)} out</span>
      </a>
    </div>

    <div class="home-body">
      <section class="panel home-panel">
        <div class="panel-head">
          <span class="label">Today's tasks</span>
          <a class="panel-link" href="#/tasks">All →</a>
        </div>
        ${
          todays.length
            ? `<ul class="task-list">${todays
                .map(
                  (t) => `<li class="task ${isCheckedNow(t, day) ? "task--done" : ""}">
                    <button class="task-box" data-toggle="${t.id}" aria-label="Toggle"></button>
                    <span class="task-text">${esc(t.title)}</span>
                  </li>`
                )
                .join("")}</ul>`
            : `<p class="empty-line">Nothing due today. Add tomorrow's plan before you close the laptop.</p>`
        }
      </section>

      <div class="home-col">
        <section class="panel home-panel">
          <div class="panel-head">
            <span class="label">Latest journal entry</span>
            <a class="panel-link" href="#/journal">All →</a>
          </div>
          ${
            latestEntry
              ? `<a class="home-entry" href="#/journal">
                  <span class="home-entry-date">${latestEntry.entry_date}</span>
                  <span class="entry-title">${esc(latestEntry.title)}</span>
                  <span class="home-entry-excerpt">${esc(excerpt(latestEntry.designed || latestEntry.why || latestEntry.rejected, 40))}</span>
                </a>`
              : `<p class="empty-line">No entries yet — 90 seconds at the end of a session.</p>`
          }
        </section>

        <section class="panel home-panel">
          <div class="panel-head">
            <span class="label">Follow-ups due</span>
            <a class="panel-link" href="#/leads">Pipeline →</a>
          </div>
          ${
            followUps.length
              ? followUps
                  .map(
                    (l) => `<a class="followup ${l.follow_up_on < day ? "followup--overdue" : ""}" href="#/leads">
                      <span class="followup-date">${l.follow_up_on}</span>
                      <span class="followup-name">${esc(l.name || "—")}</span>
                      <span class="badge" data-stage="${esc(l.stage)}">${esc(l.stage)}</span>
                    </a>`
                  )
                  .join("")
              : `<p class="empty-line">Nothing due in the next two days.</p>`
          }
        </section>

        <section class="panel home-panel">
          <div class="panel-head">
            <span class="label">Content queue</span>
            <a class="panel-link" href="#/content">Content →</a>
          </div>
          ${
            queue.length
              ? queue
                  .map(
                    (c) => `<a class="followup" href="#/content">
                      <span class="followup-date">${c.publish_on || "no date"}</span>
                      <span class="followup-name">${esc(c.title || "—")}</span>
                      <span class="badge" data-status="${esc(c.status)}">${esc(c.status)}</span>
                    </a>`
                  )
                  .join("")
              : `<p class="empty-line">Nothing drafted or scheduled.</p>`
          }
        </section>

        ${
          renewals.length
            ? `<section class="panel home-panel">
                <div class="panel-head">
                  <span class="label">Renewals ≤ 7 days</span>
                  <a class="panel-link" href="#/finance">Finance →</a>
                </div>
                ${renewals
                  .map(
                    (s) => `<a class="followup" href="#/finance">
                      <span class="followup-date">${s.next_renewal}</span>
                      <span class="followup-name">${esc(s.name)}</span>
                      <span class="badge">${fmtSub(s)}</span>
                    </a>`
                  )
                  .join("")}
              </section>`
            : ""
        }
      </div>
    </div>

    <footer class="home-quote" id="quote-box" role="button" tabindex="0" title="Show another">
      <p class="home-quote-text">“${esc(quote[0])}”</p>
      <div class="label">— ${esc(quote[1])}</div>
    </footer>
  </div>`;

  $("#mission", main).addEventListener("change", (e) => setSetting("mission", e.target.value.trim()));
  wireTaskListEvents(main);

  const nextQuote = () => {
    quoteOffset++;
    const q = QUOTES[(dayNumber + quoteOffset) % QUOTES.length];
    $(".home-quote-text", main).textContent = `“${q[0]}”`;
    $("#quote-box .label", main).textContent = `— ${q[1]}`;
  };
  $("#quote-box", main).addEventListener("click", nextQuote);
  $("#quote-box", main).addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      nextQuote();
    }
  });
}
