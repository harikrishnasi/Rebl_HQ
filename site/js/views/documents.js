// DOCUMENTS — append-only versioned documents, natively viewable (md/pdf/img/txt).
import { cache, ins, upd, del, storage, userId } from "../db.js";
import { $, $$, esc, rerender, uid, toast, openModal } from "../ui.js";
import { renderMd } from "../md.js";
import { visible, filterBadge, tagChipHtml, tagSelectHtml, resolveTagChange } from "../tags.js";

const ACCEPT = [".md", ".pdf", ".png", ".jpg", ".jpeg", ".webp", ".txt"];
const MAX_BYTES = 25 * 1024 * 1024;

const versionsOf = (docId) =>
  cache.versions.filter((v) => v.document_id === docId).sort((a, b) => b.version_no - a.version_no);
const latestOf = (docId) => versionsOf(docId)[0] || null;

function kindIcon(v) {
  if (!v) return "—";
  if (v.kind === "markdown") return "MD";
  const m = v.mime_type || "";
  if (m.includes("pdf")) return "PDF";
  if (m.startsWith("image/")) return "IMG";
  return "TXT";
}

/* ---------------- list view ---------------- */

export function renderDocuments(main) {
  const docs = visible(cache.documents).sort((a, b) => {
    const la = latestOf(a.id)?.created_at || a.created_at || "";
    const lb = latestOf(b.id)?.created_at || b.created_at || "";
    return la < lb ? 1 : -1;
  });
  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label">documents ${filterBadge()}</div>
        <h1 class="display">Documents</h1>
      </div>
    </div>
    <div class="toolbar"><button class="btn btn--primary" id="new-doc">+ New document</button></div>
    ${
      docs.length
        ? `<div class="doc-list">${docs
            .map((d) => {
              const l = latestOf(d.id);
              return `<div class="doc-row">
                <span class="badge">${kindIcon(l)}</span>
                <a class="doc-row-title" href="#/documents/${d.id}">${esc(d.title)}</a>
                ${tagChipHtml(d.tag_id)}
                <span class="doc-row-date">v${l?.version_no ?? 0}</span>
                <span class="doc-row-date">${(l?.created_at || "").slice(0, 10)}</span>
                <button class="icon-btn" data-del-doc="${d.id}" title="Delete">×</button>
              </div>`;
            })
            .join("")}</div>`
        : `<div class="empty">No documents yet.</div>`
    }`;
  $("#new-doc", main).addEventListener("click", () => versionModal(null));
  $$("[data-del-doc]", main).forEach((b) =>
    b.addEventListener("click", () => deleteDocFlow(b.dataset.delDoc))
  );
}

function deleteDocFlow(docId) {
  const doc = cache.documents.find((d) => d.id === docId);
  const vs = versionsOf(docId);
  if (
    !confirm(
      `Delete "${doc?.title}" and all ${vs.length} version${vs.length === 1 ? "" : "s"}? ` +
        `Uploaded files are removed from storage too. This cannot be undone.`
    )
  )
    return;
  const paths = vs.filter((v) => v.file_path).map((v) => v.file_path);
  if (paths.length) storage.remove(paths).catch(() => {});
  vs.forEach((v) => {
    cache.versions = cache.versions.filter((x) => x.id !== v.id);
  });
  del("documents", docId); // cascades versions server-side
  if (location.hash.includes(docId)) location.hash = "#/documents";
}

/* ---------------- document view ---------------- */

let viewingVersion = {}; // docId -> version id currently open (default latest)
let editing = null; // version id being edited as markdown

export function renderDocumentView(main, docId) {
  const doc = cache.documents.find((d) => d.id === docId);
  if (!doc) {
    location.hash = "#/documents";
    return;
  }
  const vs = versionsOf(docId);
  const latest = vs[0] || null;
  const open = vs.find((v) => v.id === viewingVersion[docId]) || latest;
  const isLatest = open && latest && open.id === latest.id;

  main.innerHTML = `
    <div class="section-head">
      <div>
        <div class="label"><a class="back-link" href="#/documents">← Documents</a> · ${tagChipHtml(doc.tag_id)} ${filterBadge()}</div>
        <h1 class="display">${esc(doc.title)}</h1>
      </div>
    </div>
    <div class="toolbar toolbar--scroll">
      <button class="chip" id="doc-newver">New version</button>
      ${open ? `<button class="chip" id="doc-download">Download</button>` : ""}
      ${open?.kind === "markdown" && isLatest ? `<button class="chip" id="doc-edit" aria-pressed="${editing === open.id}">Edit</button>` : ""}
      <button class="chip" id="doc-rename">Rename</button>
    </div>
    ${
      open && !isLatest
        ? `<div class="doc-banner">Viewing v${open.version_no} — not latest · <a href="#" id="back-latest">Back to latest</a></div>`
        : ""
    }
    <div class="doc-layout">
      <div class="doc-pane" id="doc-pane">
        ${open ? paneHtml(open) : `<div class="empty">No versions yet — upload one.</div>`}
      </div>
      <aside class="version-rail">
        <div class="label" style="margin-bottom:10px">Versions</div>
        ${vs
          .map(
            (v) => `<button class="version-item ${open && v.id === open.id ? "version-item--open" : ""}" data-ver="${v.id}">
              <span class="version-no">v${v.version_no}</span>
              <span class="version-date">${(v.created_at || "").slice(0, 10)}</span>
              <span class="badge">${kindIcon(v)}</span>
              ${v.note ? `<span class="version-note">${esc(v.note)}</span>` : ""}
            </button>`
          )
          .join("")}
      </aside>
    </div>`;

  // pane content that needs async work (signed urls / fetch)
  if (open) hydratePane(open);

  $("#back-latest", main)?.addEventListener("click", (e) => {
    e.preventDefault();
    viewingVersion[docId] = latest.id;
    editing = null;
    rerender();
  });
  $$("[data-ver]", main).forEach((b) =>
    b.addEventListener("click", () => {
      viewingVersion[docId] = b.dataset.ver;
      editing = null;
      rerender();
    })
  );
  $("#doc-newver", main).addEventListener("click", () => versionModal(doc));
  $("#doc-rename", main).addEventListener("click", () => {
    const title = (prompt("Document title:", doc.title) || "").trim();
    if (title) upd("documents", doc.id, { title });
  });
  $("#doc-download", main)?.addEventListener("click", async () => {
    if (open.kind === "markdown") {
      const blob = new Blob([open.content || ""], { type: "text/markdown" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${doc.title.replace(/[^\w-]+/g, "-")}-v${open.version_no}.md`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const { url, error } = await storage.signedUrl(open.file_path);
      if (error || !url) return toast("Could not create download link", true);
      window.open(url, "_blank");
    }
  });
  $("#doc-edit", main)?.addEventListener("click", () => {
    editing = editing === open.id ? null : open.id;
    rerender();
  });

  if (editing === open?.id) {
    const pane = $("#doc-pane", main);
    pane.innerHTML = `
      <textarea class="doc-body" id="edit-src">${esc(open.content || "")}</textarea>
      <div class="modal-actions" style="margin-top:12px">
        <input class="input" id="edit-note" placeholder="What changed? (optional)" style="max-width:320px" />
        <button class="btn btn--primary" id="edit-save">Save as v${(latest?.version_no || 0) + 1}</button>
        <button class="btn" id="edit-cancel">Cancel</button>
      </div>`;
    $("#edit-save", main).addEventListener("click", () => {
      const content = $("#edit-src", main).value;
      const v = ins("document_versions", {
        document_id: doc.id,
        version_no: (latest?.version_no || 0) + 1,
        kind: "markdown",
        content,
        note: $("#edit-note", main).value.trim() || null,
        created_at: new Date().toISOString(),
      });
      viewingVersion[doc.id] = v.id;
      editing = null;
      rerender();
    });
    $("#edit-cancel", main).addEventListener("click", () => {
      editing = null;
      rerender();
    });
  }
}

function paneHtml(v) {
  if (v.kind === "markdown") return `<div class="prose">${renderMd(v.content)}</div>`;
  const m = v.mime_type || "";
  if (m.includes("pdf")) return `<div class="pane-loading label">Loading PDF…</div>`;
  if (m.startsWith("image/")) return `<div class="pane-loading label">Loading image…</div>`;
  return `<div class="pane-loading label">Loading…</div>`;
}

async function hydratePane(v) {
  if (v.kind === "markdown") return;
  const pane = $("#doc-pane");
  const { url, error } = await storage.signedUrl(v.file_path);
  if (!pane) return;
  if (error || !url) {
    pane.innerHTML = `<div class="empty">Could not load this file.</div>`;
    return;
  }
  const m = v.mime_type || "";
  if (m.includes("pdf")) {
    pane.innerHTML = `<iframe class="doc-frame" src="${url}" title="PDF"></iframe>`;
  } else if (m.startsWith("image/")) {
    pane.innerHTML = `<img class="doc-img" src="${url}" alt="" />`;
  } else {
    try {
      const text = await (await fetch(url)).text();
      pane.innerHTML = `<pre class="doc-txt">${esc(text)}</pre>`;
    } catch {
      pane.innerHTML = `<div class="empty">Could not load this file.</div>`;
    }
  }
}

/* ---------------- new document / new version modal ---------------- */

function versionModal(doc) {
  const isNew = !doc;
  const { overlay, close } = openModal(`
    <div class="label">${isNew ? "New document" : `New version of "${esc(doc.title)}"`}</div>
    <form class="modal-form" id="ver-form">
      ${isNew ? `<input class="input" id="vd-title" placeholder="Document title" required />` : ""}
      ${isNew ? tagSelectHtml(undefined, 'id="vd-tag"') : ""}
      <div class="kind-toggle" role="group">
        <button type="button" class="chip" data-src="write" aria-pressed="true">Write markdown</button>
        <button type="button" class="chip" data-src="upload" aria-pressed="false">Upload file</button>
      </div>
      <textarea class="doc-body doc-body--entry" id="vd-md" placeholder="Write in markdown…"></textarea>
      <div id="vd-file-wrap" hidden>
        <input class="input" type="file" id="vd-file" accept="${ACCEPT.join(",")}" />
        <p class="muted" style="font-size:12.5px;margin-top:6px">Accepted: ${ACCEPT.join(" ")} · max 25 MB</p>
      </div>
      <input class="input" id="vd-note" placeholder="What changed? (optional)" />
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn--primary" id="vd-submit">${isNew ? "Create" : "Add version"}</button>
      </div>
    </form>`);
  let src = "write";
  $$("[data-src]", overlay).forEach((b) =>
    b.addEventListener("click", () => {
      src = b.dataset.src;
      $$("[data-src]", overlay).forEach((x) => x.setAttribute("aria-pressed", x.dataset.src === src));
      $("#vd-md", overlay).hidden = src !== "write";
      $("#vd-file-wrap", overlay).hidden = src !== "upload";
    })
  );
  $("#vd-tag", overlay)?.addEventListener("change", (e) => {
    const id = resolveTagChange(e.target);
    if (id !== null) e.target.value = id;
  });
  $("[data-close]", overlay).addEventListener("click", close);
  $("#ver-form", overlay).addEventListener("submit", async (e) => {
    e.preventDefault();
    const note = $("#vd-note", overlay).value.trim() || null;
    let targetDoc = doc;

    const submitBtn = $("#vd-submit", overlay);
    submitBtn.disabled = true;

    const makeDoc = () => {
      const title = $("#vd-title", overlay).value.trim();
      if (!title) return null;
      return ins("documents", {
        title,
        tag_id: $("#vd-tag", overlay)?.value || null,
        created_at: new Date().toISOString(),
      });
    };

    if (src === "write") {
      if (isNew) {
        targetDoc = makeDoc();
        if (!targetDoc) return void (submitBtn.disabled = false);
      }
      const vno = (latestOf(targetDoc.id)?.version_no || 0) + 1;
      const v = ins("document_versions", {
        document_id: targetDoc.id,
        version_no: vno,
        kind: "markdown",
        content: $("#vd-md", overlay).value,
        note,
        created_at: new Date().toISOString(),
      });
      viewingVersion[targetDoc.id] = v.id;
      close();
      location.hash = `#/documents/${targetDoc.id}`;
      rerender();
      return;
    }

    // upload path
    const file = $("#vd-file", overlay).files[0];
    if (!file) return void (submitBtn.disabled = false);
    const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
    if (!ACCEPT.includes(ext)) {
      toast(`File type ${ext} is not accepted`, true);
      return void (submitBtn.disabled = false);
    }
    if (file.size > MAX_BYTES) {
      toast("File is over the 25 MB limit", true);
      return void (submitBtn.disabled = false);
    }

    if (ext === ".md") {
      // markdown uploads become native markdown versions
      const content = await file.text();
      if (isNew) {
        targetDoc = makeDoc();
        if (!targetDoc) return void (submitBtn.disabled = false);
      }
      const vno = (latestOf(targetDoc.id)?.version_no || 0) + 1;
      const v = ins("document_versions", {
        document_id: targetDoc.id, version_no: vno, kind: "markdown", content, note,
        created_at: new Date().toISOString(),
      });
      viewingVersion[targetDoc.id] = v.id;
      close();
      location.hash = `#/documents/${targetDoc.id}`;
      rerender();
      return;
    }

    if (isNew) {
      targetDoc = makeDoc();
      if (!targetDoc) return void (submitBtn.disabled = false);
    }
    const vno = (latestOf(targetDoc.id)?.version_no || 0) + 1;
    const path = `${userId}/${targetDoc.id}/${vno}/${file.name}`;
    const mime =
      file.type ||
      { ".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".txt": "text/plain" }[ext] ||
      "application/octet-stream";
    const { error } = await storage.upload(path, file, mime);
    if (error) {
      toast("Upload failed: " + (error.message || "storage error"), true);
      submitBtn.disabled = false;
      return;
    }
    const v = ins("document_versions", {
      document_id: targetDoc.id, version_no: vno, kind: "file", file_path: path, mime_type: mime, note,
      created_at: new Date().toISOString(),
    });
    viewingVersion[targetDoc.id] = v.id;
    close();
    location.hash = `#/documents/${targetDoc.id}`;
    rerender();
  });
}
