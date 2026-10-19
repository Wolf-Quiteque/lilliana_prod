// Browser-side tidy-up of contentEditable output. The server sanitizes again on save; this just
// keeps the stored markup small and predictable (<em>, <strong>, <br>, <a>).

const KEEP = new Set(["EM", "STRONG", "BR", "A"]);
const RENAME: Record<string, string> = { I: "em", B: "strong" };

export function cleanRichHtml(html: string): string {
  if (typeof document === "undefined") return html;
  const tpl = document.createElement("template");
  tpl.innerHTML = html;

  const walk = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return escapeText(node.textContent ?? "");
    if (node.nodeType !== Node.ELEMENT_NODE) return "";
    const el = node as HTMLElement;
    const inner = Array.from(el.childNodes).map(walk).join("");
    const tag = RENAME[el.tagName]?.toUpperCase() ?? el.tagName;
    if (tag === "BR") return "<br>";
    if (tag === "DIV" || tag === "P") return (inner ? "<br>" : "") + inner;
    // Chrome sometimes wraps colored text in spans with inline styles; keep the text only
    if (tag === "SPAN" && /font-style:\s*italic|font-weight:\s*(bold|[6-9]00)/.test(el.getAttribute("style") ?? "")) {
      return /italic/.test(el.getAttribute("style") ?? "") ? `<em>${inner}</em>` : `<strong>${inner}</strong>`;
    }
    if (!KEEP.has(tag) || !inner) return inner;
    if (tag === "A") {
      const href = el.getAttribute("href") ?? "";
      return `<a href="${escapeAttr(href)}">${inner}</a>`;
    }
    const t = tag.toLowerCase();
    return `<${t}>${inner}</${t}>`;
  };

  return Array.from(tpl.content.childNodes)
    .map(walk)
    .join("")
    .replace(/^(<br>)+/, "")
    .replace(/(<br>)+$/, "")
    .replace(/<\/(em|strong)><\1>/g, "");
}

function escapeText(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, " ");
}
function escapeAttr(s: string) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
