// EXPORT: dump all Supabase tables to one JSON file.
// IMPORT: v3 dump (restores rows) or the old v2 localStorage-app export
// (migrated per the v3 spec: leads→leads, tasks→once tasks, expenses→transactions,
//  documents→document+markdown v1, journal→journal_entries).
import { cache, TABLES, insAwait } from "./db.js";
import { uid, todayStr, toast, rerender } from "./ui.js";
import { buildDump, verifyDump, extractDataJsonFromZip } from "./backup.js";

export async function exportJson() {
  // storage binaries are not included — file versions keep their metadata + storage path
  const { json } = await buildDump();
  const blob = new Blob([json], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rebl-hq-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export function importJson(e) {
  const file = e.target.files[0];
  e.target.value = "";
  if (!file) return;
  (async () => {
    try {
      // accept a raw .json export/snapshot OR a full-backup .zip
      const text = file.name.endsWith(".zip")
        ? await extractDataJsonFromZip(await file.arrayBuffer())
        : await file.text();
      if (!text) throw new Error("no data.json found in the file");
      const data = JSON.parse(text);

      if (data?.v === 3 && data.tables) {
        const v = await verifyDump(data);
        if (!v.ok && v.reason.includes("Checksum") &&
            !confirm(`⚠ ${v.reason}. Import anyway?`)) return;
        if (!confirm(`Import "${file.name}"?\n${v.rows} rows, ${v.files} file reference(s). Existing rows are kept; only new ids are added (no overwrite, no delete).`)) return;
        const added = await importV3(data.tables);
        toast(`Import complete — ${added} new row(s) added`);
      } else if (Array.isArray(data?.sections)) {
        if (!confirm(`Migrate old app export "${file.name}" into Supabase?`)) return;
        await importV2(data);
        toast("Import complete");
      } else {
        throw new Error("unrecognized format");
      }
      rerender();
    } catch (err) {
      console.error(err);
      toast("Import failed: " + err.message, true);
    }
  })();
}

async function importV3(tables) {
  const order = TABLES.filter((t) => t !== "settings"); // keep FK order: tags first
  let added = 0;
  for (const t of order) {
    const rows = (tables[t] || []).map(({ user_id, ...r }) => r);
    // skip rows whose id already exists locally
    const keyMap = {
      tags: "tags", leads: "leads", content_items: "content", tasks: "tasks",
      task_completions: "completions", finance_categories: "categories",
      transactions: "transactions", subscriptions: "subscriptions",
      documents: "documents", document_versions: "versions", journal_entries: "journal",
      notes: "notes", social_accounts: "accounts", websites: "websites",
    };
    const existing = new Set(cache[keyMap[t]].map((r) => r.id));
    const fresh = rows.filter((r) => r.id && !existing.has(r.id));
    if (fresh.length) await insAwait(t, fresh);
    added += fresh.length;
  }
  return added;
}

/* ---- v2 (localStorage app) migration ---- */

function colVal(section, row, colName) {
  const col = (section.columns || []).find((c) => c.name.toLowerCase() === colName.toLowerCase());
  return col ? row.cells?.[col.id] : undefined;
}

async function importV2(ws) {
  const leads = [];
  const tasks = [];
  const txs = [];
  const docs = [];
  const versions = [];
  const entries = [];
  let needsUncategorized = false;
  let uncatId = cache.categories.find((c) => c.kind === "expense" && c.name === "Uncategorized")?.id;

  for (const s of ws.sections || []) {
    if (s.type === "tracker" && (s.columns || []).some((c) => c.name === "Stage")) {
      for (const r of s.rows || []) {
        leads.push({
          id: uid(),
          name: String(colVal(s, r, "Name") || "—"),
          stage: colVal(s, r, "Stage") || "Shortlist",
          contact: colVal(s, r, "Contact") || null,
          segment: colVal(s, r, "Segment") || null,
          reach_out_on: colVal(s, r, "Reach out on") || null,
          follow_up_on: colVal(s, r, "Follow up on") || null,
          notes: colVal(s, r, "Notes") || null,
        });
      }
    } else if (s.type === "tracker" && (s.columns || []).some((c) => c.name === "Amount")) {
      for (const r of s.rows || []) {
        const amount = Number(colVal(s, r, "Amount"));
        if (!amount || amount <= 0) continue;
        needsUncategorized = true;
        txs.push({
          id: uid(),
          occurred_on: colVal(s, r, "Next renewal") || r.updated || todayStr(),
          kind: "expense",
          amount,
          note: [colVal(s, r, "Item"), colVal(s, r, "Notes")].filter(Boolean).join(" — ") || null,
          method: null,
        });
      }
    } else if (s.type === "tasks") {
      for (const t of s.tasks || []) {
        if (t.done) continue; // completed one-offs aren't worth migrating
        tasks.push({ id: uid(), title: t.text, recurrence: "once", due_date: null, anchor_date: t.created || todayStr(), archived: false });
      }
    } else if (s.type === "docs") {
      for (const d of s.docs || []) {
        const docId = uid();
        docs.push({ id: docId, title: d.title || "Untitled" });
        versions.push({ id: uid(), document_id: docId, version_no: 1, kind: "markdown", content: d.body || "", note: "migrated from v2" });
      }
    } else if (s.type === "journal") {
      for (const en of s.entries || []) {
        entries.push({ id: uid(), entry_date: en.date || todayStr(), title: en.title || "Entry", designed: en.body || null, rejected: null, why: null });
      }
    }
  }

  if (needsUncategorized && !uncatId) {
    uncatId = uid();
    await insAwait("finance_categories", [{ id: uncatId, name: "Uncategorized", kind: "expense" }]);
  }
  txs.forEach((t) => (t.category_id = uncatId || null));

  if (leads.length) await insAwait("leads", leads);
  if (tasks.length) await insAwait("tasks", tasks);
  if (txs.length) await insAwait("transactions", txs);
  if (docs.length) await insAwait("documents", docs);
  if (versions.length) await insAwait("document_versions", versions);
  if (entries.length) await insAwait("journal_entries", entries);
}
