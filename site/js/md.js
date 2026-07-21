// Markdown rendering: marked (GFM) + DOMPurify sanitization.
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

// Every external link opens safely: target=_blank + rel=noopener noreferrer.
// (DOMPurify already strips javascript:/data: URIs from href by default.)
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A" && node.getAttribute("href")) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

export function renderMd(src) {
  if (!src) return "";
  const html = marked.parse(String(src));
  return DOMPurify.sanitize(html, {
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style"],
    ALLOW_DATA_ATTR: false,
    ADD_ATTR: ["target", "rel"],
  });
}

/** first ~n words of a markdown source, as plain text */
export function excerpt(src, n = 40) {
  const text = String(src || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[#>*_`|[\]()-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = text.split(" ");
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}
