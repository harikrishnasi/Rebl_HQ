// BACKUP — two layers of insurance:
//   1. Full local backup: one .zip with the complete data dump + every uploaded
//      document file, built client-side (STORE zip, no dependency).
//   2. Supabase snapshots: the JSON dump written into the private hq-docs bucket
//      under {uid}/backups/. One is taken automatically per day on login;
//      the last KEEP_SNAPSHOTS are kept.
import { cache, storage, userId, setSetting } from "./db.js";
import { $, $$, esc, todayStr, toast, openModal } from "./ui.js";

const KEEP_DAILY = 14;    // keep the last 14 daily snapshots
const KEEP_MONTHLY = 12;  // + the first snapshot of each of the last 12 months
const PREFIX = () => `${userId}/backups`;

/* ---------------- dump + integrity ---------------- */

export function dumpData() {
  return {
    app: "rebl-hq",
    v: 3,
    exported_at: new Date().toISOString(),
    tables: {
      tags: cache.tags,
      leads: cache.leads,
      content_items: cache.content,
      tasks: cache.tasks,
      task_completions: cache.completions,
      finance_categories: cache.categories,
      transactions: cache.transactions,
      subscriptions: cache.subscriptions,
      documents: cache.documents,
      document_versions: cache.versions,
      journal_entries: cache.journal,
      notes: cache.notes,
      social_accounts: cache.accounts,
      websites: cache.websites,
      settings: cache.settingsRows,
    },
  };
}

async function sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** dump + a manifest (per-table counts, total rows, file count, SHA-256 of the
 *  serialized tables) so any backup can be integrity-checked before you trust it. */
export async function buildDump() {
  const dump = dumpData();
  const tablesJson = JSON.stringify(dump.tables);
  dump.manifest = {
    counts: Object.fromEntries(Object.entries(dump.tables).map(([k, v]) => [k, v.length])),
    total_rows: Object.values(dump.tables).reduce((n, v) => n + v.length, 0),
    file_versions: dump.tables.document_versions.filter((v) => v.file_path).length,
    sha256: await sha256Hex(tablesJson),
  };
  return { dump, json: JSON.stringify(dump, null, 2) };
}

/** verify a parsed dump: shape + checksum. Returns {ok, rows, files, reason}. */
export async function verifyDump(dump) {
  if (!dump || dump.app !== "rebl-hq" || !dump.tables)
    return { ok: false, reason: "Not a REBL HQ backup" };
  const rows = Object.values(dump.tables).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  const files = (dump.tables.document_versions || []).filter((v) => v.file_path).length;
  if (dump.manifest?.sha256) {
    const got = await sha256Hex(JSON.stringify(dump.tables));
    if (got !== dump.manifest.sha256)
      return { ok: false, rows, files, reason: "Checksum mismatch — file may be corrupt or edited" };
  }
  return { ok: true, rows, files };
}

/* ---------------- minimal ZIP writer (STORE, utf-8 names) ---------------- */

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZip(files) {
  // files: [{ name, data: Uint8Array }]
  const enc = new TextEncoder();
  const d = new Date();
  const time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const f of files) {
    const nameB = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true); // utf-8 names
    lh.setUint16(8, 0, true); // store
    lh.setUint16(10, time, true);
    lh.setUint16(12, date, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true);
    lh.setUint32(22, f.data.length, true);
    lh.setUint16(26, nameB.length, true);
    lh.setUint16(28, 0, true);
    chunks.push(new Uint8Array(lh.buffer), nameB, f.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true);
    ch.setUint16(14, date, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true);
    ch.setUint32(24, f.data.length, true);
    ch.setUint16(28, nameB.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), nameB);
    offset += 30 + nameB.length + f.data.length;
  }

  const centralSize = central.reduce((s, c) => s + c.length, 0);
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, centralSize, true);
  eocd.setUint32(16, offset, true);
  return new Blob([...chunks, ...central, new Uint8Array(eocd.buffer)], { type: "application/zip" });
}

/** Pull data.json out of one of our STORE (uncompressed) backup zips. */
export async function extractDataJsonFromZip(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const dv = new DataView(arrayBuffer);
  const dec = new TextDecoder();
  for (let i = 0; i + 4 <= bytes.length; i++) {
    if (dv.getUint32(i, true) !== 0x04034b50) continue;
    const nameLen = dv.getUint16(i + 26, true);
    const extraLen = dv.getUint16(i + 28, true);
    const size = dv.getUint32(i + 22, true); // uncompressed size (STORE)
    const nameStart = i + 30;
    const name = dec.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    if (name === "data.json") return dec.decode(bytes.subarray(dataStart, dataStart + size));
    i = dataStart + size - 1; // skip this entry's data
  }
  return null;
}

/* ---------------- full local backup (.zip) ---------------- */

const safe = (s) => String(s || "file").replace(/[^\w.-]+/g, "-").slice(0, 60);

export async function downloadFullBackup(onProgress = () => {}) {
  const { dump } = await buildDump();
  const fileVersions = cache.versions.filter((v) => v.file_path);
  const files = [];
  const missing = [];

  for (let i = 0; i < fileVersions.length; i++) {
    const v = fileVersions[i];
    onProgress(`Fetching file ${i + 1}/${fileVersions.length}…`);
    const doc = cache.documents.find((d) => d.id === v.document_id);
    const base = v.file_path.split("/").pop();
    try {
      const { url, error } = await storage.signedUrl(v.file_path);
      if (error || !url) throw new Error("no signed url");
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch " + res.status);
      const buf = new Uint8Array(await res.arrayBuffer());
      files.push({ name: `files/${safe(doc?.title)}-v${v.version_no}/${safe(base)}`, data: buf });
    } catch (e) {
      missing.push({ file_path: v.file_path, reason: String(e.message || e) });
    }
  }

  dump.manifest.files_included = files.length;
  if (missing.length) dump.missing_files = missing;
  // README inside the zip so a bare backup is self-describing
  const readme =
    `REBL HQ full backup — ${dump.exported_at}\n\n` +
    `data.json  : every table (${dump.manifest.total_rows} rows). Restore via the app's Import button.\n` +
    `files/     : ${files.length} uploaded document file(s).\n` +
    `checksum   : sha256(tables) = ${dump.manifest.sha256}\n\n` +
    `Keep a copy off-site (e.g. your Google Drive folder). This zip is the complete\n` +
    `state of your dashboard and knowledge base.\n`;
  files.unshift({ name: "README.txt", data: new TextEncoder().encode(readme) });
  files.unshift({ name: "data.json", data: new TextEncoder().encode(JSON.stringify(dump, null, 2)) });

  onProgress("Building zip…");
  const blob = buildZip(files);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `rebl-hq-full-backup-${todayStr()}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  setSetting("last_full_backup_at", new Date().toISOString());
  return { files: files.length - 2, missing: missing.length, rows: dump.manifest.total_rows };
}

/* ---------------- Supabase snapshots ---------------- */

export async function listSnapshots() {
  const { data, error } = await storage.list(PREFIX());
  if (error) return [];
  return (data || [])
    .filter((f) => f.name.endsWith(".json"))
    .sort((a, b) => (a.name < b.name ? 1 : -1));
}

/** keep the last KEEP_DAILY snapshots + the first of each of the last KEEP_MONTHLY
 *  months; delete the rest. Long-term history without unbounded growth. */
function snapshotsToPrune(snaps) {
  const keep = new Set(snaps.slice(0, KEEP_DAILY).map((f) => f.name));
  const seenMonth = new Set();
  const monthly = [];
  for (const f of snaps) {
    const month = f.name.slice(0, 7); // YYYY-MM
    if (!seenMonth.has(month)) { seenMonth.add(month); monthly.push(f.name); }
  }
  monthly.slice(0, KEEP_MONTHLY).forEach((n) => keep.add(n));
  return snaps.filter((f) => !keep.has(f.name));
}

export async function snapshotToSupabase() {
  const stamp = new Date().toISOString().replace(/[:]/g, "-").slice(0, 19);
  const { json } = await buildDump();
  const { error } = await storage.upload(`${PREFIX()}/${stamp}.json`, new Blob([json]), "application/json");
  if (error) throw new Error(error.message || "snapshot upload failed");
  setSetting("last_snapshot_at", new Date().toISOString());
  const snaps = await listSnapshots();
  const stale = snapshotsToPrune(snaps).map((f) => `${PREFIX()}/${f.name}`);
  if (stale.length) await storage.remove(stale);
  return snaps.length ? snaps[0].name : stamp + ".json";
}

/** on login: take one snapshot per day, silently */
export async function maybeAutoSnapshot() {
  try {
    const snaps = await listSnapshots();
    const today = todayStr();
    if (snaps.some((f) => f.name.startsWith(today))) return;
    await snapshotToSupabase();
  } catch (e) {
    console.warn("auto-snapshot skipped:", e);
  }
}

/** days since the last downloaded full backup (with files), or null if never */
export function daysSinceFullBackup() {
  const at = cache.settings.last_full_backup_at;
  if (!at) return null;
  return Math.floor((Date.now() - new Date(at).getTime()) / 86400000);
}
/** true when an off-site full backup is overdue (never, or > 14 days) */
export function fullBackupStale() {
  const d = daysSinceFullBackup();
  return d === null || d > 14;
}

/* ---------------- modal ---------------- */

export function backupModal() {
  const dsf = daysSinceFullBackup();
  const freshness = dsf === null
    ? `<span class="renew-badge renew-badge--overdue">No off-site backup yet</span>`
    : dsf > 14
    ? `<span class="renew-badge renew-badge--soon">Last off-site backup ${dsf}d ago</span>`
    : `<span class="renew-badge renew-badge--ok">Off-site backup ${dsf}d ago</span>`;

  const { overlay, close } = openModal(`
    <div class="label">Backup &amp; restore</div>
    <div class="modal-form">
      <p class="muted" style="font-size:13.5px">
        Three layers: Supabase holds your live data, an integrity-checked snapshot is
        saved there automatically once a day, and the <b>full backup zip</b> (data + every
        uploaded file, checksummed) is your off-site copy. ${freshness}
      </p>
      <div class="modal-actions">
        <button class="btn btn--primary" id="bk-zip">Download full backup (.zip)</button>
        <button class="btn" id="bk-snap">Snapshot now</button>
        <label class="btn" style="cursor:pointer">Verify a backup<input type="file" id="bk-verify" accept=".json,.zip,application/json" hidden /></label>
      </div>
      <p class="muted" id="bk-status" style="font-size:13px;min-height:18px"></p>
      <p class="muted" style="font-size:12.5px">
        <b>Off-site:</b> save the zip into your Google Drive folder (or Drive desktop app) each
        week — that's your independent copy if the Supabase project is ever lost. Restore any
        backup or snapshot via the sidebar's <b>Import</b>.
      </p>
      <div class="label" style="margin-top:6px">Snapshots in Supabase · daily + monthly kept</div>
      <div id="bk-list"><p class="muted" style="font-size:13px">Loading…</p></div>
      <div class="modal-actions"><span style="flex:1"></span><button class="btn" data-close>Close</button></div>
    </div>`);
  $("[data-close]", overlay).addEventListener("click", close);
  const status = (m) => { const el = $("#bk-status", overlay); if (el) el.textContent = m; };

  async function paintList() {
    const snaps = await listSnapshots();
    const el = $("#bk-list", overlay);
    if (!el) return;
    el.innerHTML = snaps.length
      ? snaps
          .map(
            (f) => `<div class="manage-row" style="justify-content:space-between">
              <span style="font-size:13.5px">${esc(f.name.replace(".json", ""))}</span>
              <span class="muted" style="font-size:12.5px">${f.metadata?.size ? Math.max(1, Math.round(f.metadata.size / 1024)) + " KB" : ""}</span>
              <button class="linklike" data-dl-snap="${esc(f.name)}">Download</button>
            </div>`
          )
          .join("")
      : `<p class="muted" style="font-size:13px">No snapshots yet.</p>`;
    $$("[data-dl-snap]", overlay).forEach((b) =>
      b.addEventListener("click", async () => {
        const { url, error } = await storage.signedUrl(`${PREFIX()}/${b.dataset.dlSnap}`);
        if (error || !url) return toast("Could not create download link", true);
        window.open(url, "_blank");
      })
    );
  }
  paintList();

  $("#bk-zip", overlay).addEventListener("click", async (e) => {
    e.target.disabled = true;
    try {
      const { files, missing, rows } = await downloadFullBackup(status);
      status(`Done — ${rows} rows + ${files} file${files === 1 ? "" : "s"}${missing ? `, ${missing} could NOT be fetched` : ", verified"}. Save it to Google Drive.`);
      toast("Full backup downloaded");
    } catch (err) {
      console.error(err);
      status("Backup failed: " + err.message);
      toast("Backup failed", true);
    }
    e.target.disabled = false;
  });

  $("#bk-verify", overlay).addEventListener("change", async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    status("Verifying…");
    try {
      let text;
      if (file.name.endsWith(".zip")) {
        text = await extractDataJsonFromZip(await file.arrayBuffer());
        if (!text) throw new Error("no data.json in zip");
      } else {
        text = await file.text();
      }
      const res = await verifyDump(JSON.parse(text));
      status(res.ok
        ? `✓ Valid backup — ${res.rows} rows, ${res.files} file(s), checksum OK.`
        : `✗ ${res.reason}.`);
    } catch (err) {
      status("✗ Could not read backup: " + err.message);
    }
  });

  $("#bk-snap", overlay).addEventListener("click", async (e) => {
    e.target.disabled = true;
    status("Uploading snapshot…");
    try {
      await snapshotToSupabase();
      status("Snapshot saved to Supabase.");
      toast("Snapshot saved");
      paintList();
    } catch (err) {
      console.error(err);
      status("Snapshot failed: " + err.message);
      toast("Snapshot failed", true);
    }
    e.target.disabled = false;
  });
}
