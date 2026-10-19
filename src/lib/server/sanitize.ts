import "server-only";
import sanitizeHtml from "sanitize-html";

// Rich text may only contain the few tags the editor toolbar can produce.
export function sanitizeRich(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ["em", "strong", "br", "a"],
    allowedAttributes: { a: ["href", "target", "rel"] },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesAppliedToAttributes: ["href"],
    allowProtocolRelative: false,
    transformTags: {
      b: "strong",
      i: "em",
      div: (_tag, attribs) => ({ tagName: "br", attribs }),
      a: (tagName, attribs) => {
        const href = attribs.href ?? "#";
        const external: Record<string, string> = /^https?:/i.test(href) ? { target: "_blank", rel: "noopener noreferrer" } : {};
        return { tagName, attribs: { href, ...external } };
      },
    },
    exclusiveFilter: (frame) => frame.tag === "a" && !frame.attribs.href,
  })
    .replace(/<br\s*\/?>/gi, "<br>")
    .replace(/(<br>\s*)+$/i, "")
    .trim();
}
