// Data layer: Supabase client, in-memory cache, optimistic writes.
// All table access goes through `backend` so tests can inject a fake
// via globalThis.__REBL_TEST_BACKEND__.

import { createClient } from "@supabase/supabase-js";
import { syncStart, syncEnd, toast, rerender, uid } from "./ui.js";

export const TABLES = [
  "tags",
  "leads",
  "content_items",
  "tasks",
  "task_completions",
  "finance_categories",
  "transactions",
  "subscriptions",
  "documents",
  "document_versions",
  "journal_entries",
  "social_accounts",
  "settings",
];

// cache key per table
const KEY = {
  tags: "tags",
  leads: "leads",
  content_items: "content",
  tasks: "tasks",
  task_completions: "completions",
  finance_categories: "categories",
  transactions: "transactions",
  subscriptions: "subscriptions",
  documents: "documents",
  document_versions: "versions",
  journal_entries: "journal",
  social_accounts: "accounts",
  settings: "settingsRows",
};

export const cache = {
  tags: [],
  leads: [],
  content: [],
  tasks: [],
  completions: [],
  categories: [],
  transactions: [],
  subscriptions: [],
  documents: [],
  versions: [],
  journal: [],
  accounts: [],
  settingsRows: [],
  settings: {}, // key -> value, derived from settingsRows
};

export let userId = null;
let sb = null;
let backend = null;

function realBackend(client) {
  const BUCKET = "hq-docs";
  return {
    async select(table) {
      return client.from(table).select("*");
    },
    async insert(table, rows) {
      return client.from(table).insert(rows);
    },
    async update(table, id, patch) {
      return client.from(table).update(patch).eq("id", id);
    },
    async remove(table, id) {
      return client.from(table).delete().eq("id", id);
    },
    async upsertSetting(key, value) {
      return client.from("settings").upsert({ user_id: userId, key, value }, { onConflict: "user_id,key" });
    },
    auth: {
      async getSession() {
        const { data } = await client.auth.getSession();
        return data?.session ?? null;
      },
      async signIn(email, password) {
        const { data, error } = await client.auth.signInWithPassword({ email, password });
        return { session: data?.session ?? null, error };
      },
      async signOut() {
        await client.auth.signOut();
      },
    },
    storage: {
      async upload(path, file, contentType) {
        return client.storage.from(BUCKET).upload(path, file, { contentType, upsert: false });
      },
      async signedUrl(path) {
        const { data, error } = await client.storage.from(BUCKET).createSignedUrl(path, 3600);
        return { url: data?.signedUrl ?? null, error };
      },
      async remove(paths) {
        if (!paths.length) return { error: null };
        return client.storage.from(BUCKET).remove(paths);
      },
      async list(prefix) {
        return client.storage.from(BUCKET).list(prefix, { limit: 100 });
      },
    },
  };
}

/** returns an error message string, or null on success */
export function initBackend() {
  if (globalThis.__REBL_TEST_BACKEND__) {
    backend = globalThis.__REBL_TEST_BACKEND__;
    return null;
  }
  const url = import.meta.env?.VITE_SUPABASE_URL;
  const key = import.meta.env?.VITE_SUPABASE_ANON_KEY;
  if (!url || !key) {
    return (
      "Supabase is not configured. Create .env.local (copy .env.local.example) with " +
      "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart. " +
      "On Netlify, set the same two variables in Site configuration → Environment variables."
    );
  }
  sb = createClient(url, key);
  backend = realBackend(sb);
  return null;
}

export const auth = {
  getSession: (...a) => backend.auth.getSession(...a),
  signIn: (...a) => backend.auth.signIn(...a),
  signOut: (...a) => backend.auth.signOut(...a),
};
export const storage = {
  upload: (...a) => backend.storage.upload(...a),
  signedUrl: (...a) => backend.storage.signedUrl(...a),
  remove: (...a) => backend.storage.remove(...a),
  list: (...a) => backend.storage.list(...a),
};

export function setUserId(id) {
  userId = id;
}

function deriveSettings() {
  cache.settings = Object.fromEntries(cache.settingsRows.map((r) => [r.key, r.value]));
}

export const missingTables = [];

export async function loadAll() {
  missingTables.length = 0;
  const results = await Promise.all(
    TABLES.map(async (t) => {
      const { data, error } = await backend.select(t);
      if (error) {
        const msg = error.message || String(error);
        // table not migrated yet — degrade to empty instead of bricking the app
        if (/does not exist|42P01|relation/i.test(msg)) {
          missingTables.push(t);
          return [t, []];
        }
        throw new Error(`Loading ${t}: ${msg}`);
      }
      return [t, data || []];
    })
  );
  for (const [t, rows] of results) cache[KEY[t]] = rows;
  deriveSettings();
}

/** first login: seed the two company tags if none exist */
export async function seedTags() {
  if (cache.tags.length) return;
  const rows = [
    { id: uid(), name: "Rebl" },
    { id: uid(), name: "Orbit" },
  ];
  const { error } = await backend.insert("tags", rows);
  if (!error) cache.tags = rows.map((r) => ({ ...r, user_id: userId }));
}

/* ---------------- optimistic writes ----------------
   apply the local change, kick off the remote write, revert + toast on failure. */
function optimistic(apply, revert, op) {
  apply();
  syncStart();
  rerender();
  op()
    .then(({ error } = {}) => {
      if (error) {
        console.error(error);
        revert();
        syncEnd(false);
        toast("Sync failed: " + (error.message || "write rejected"), true);
        rerender();
      } else {
        syncEnd(true);
      }
    })
    .catch((e) => {
      console.error(e);
      revert();
      syncEnd(false);
      toast("Sync failed — check your connection", true);
      rerender();
    });
}

/** insert `row` (id generated if missing) into table + cache. Returns the row. */
export function ins(table, row) {
  const full = { id: row.id || uid(), ...row };
  const key = KEY[table];
  optimistic(
    () => cache[key].push({ ...full, user_id: userId }),
    () => (cache[key] = cache[key].filter((r) => r.id !== full.id)),
    () => backend.insert(table, [full])
  );
  return full;
}

export function upd(table, id, patch) {
  const key = KEY[table];
  const row = cache[key].find((r) => r.id === id);
  if (!row) return;
  const before = { ...row };
  optimistic(
    () => Object.assign(row, patch),
    () => Object.assign(row, before),
    () => backend.update(table, id, patch)
  );
}

export function del(table, id) {
  const key = KEY[table];
  const idx = cache[key].findIndex((r) => r.id === id);
  if (idx === -1) return;
  const [row] = [cache[key][idx]];
  optimistic(
    () => cache[key].splice(idx, 1),
    () => cache[key].splice(idx, 0, row),
    () => backend.remove(table, id)
  );
}

export function setSetting(key, value) {
  const row = cache.settingsRows.find((r) => r.key === key);
  const before = row ? row.value : undefined;
  optimistic(
    () => {
      if (row) row.value = value;
      else cache.settingsRows.push({ user_id: userId, key, value });
      deriveSettings();
    },
    () => {
      const r = cache.settingsRows.find((x) => x.key === key);
      if (r) r.value = before;
      deriveSettings();
    },
    () => backend.upsertSetting(key, value)
  );
}

/** direct (non-optimistic) insert used by the importer — awaits the result */
export async function insAwait(table, rows) {
  const { error } = await backend.insert(table, rows);
  if (error) throw new Error(`${table}: ${error.message || "insert failed"}`);
  cache[KEY[table]].push(...rows.map((r) => ({ ...r, user_id: userId })));
  if (table === "settings") deriveSettings();
}
