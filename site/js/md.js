// Markdown rendering: marked (GFM) + DOMPurify sanitization.
import { marked } from "marked";
import DOMPurify from "dompurify";

marked.setOptions({ gfm: true, breaks: false });

export function renderMd(src) {
  if (!src) return "";
  const html = marked.parse(String(src));
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ["target"],
    FORBID_TAGS: ["style", "form", "input", "button"],
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
