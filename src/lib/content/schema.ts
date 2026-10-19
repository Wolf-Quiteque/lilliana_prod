import { DEFAULT_CONTENT } from "./defaults";
import { isAllowedEmbed, parseVideoUrl } from "./embeds";
import { newId, patternOf } from "./paths";
import type { SectionId, SiteContent } from "./types";

// Which text fields accept light formatting (accent highlight, bold, links, line breaks).
// Everything else is plain text.
export const RICH_PATTERNS = new Set([
  "hero.title",
  "hero.body",
  "meet.title",
  "meet.paragraphs.*.text",
  "services.title",
  "services.intro",
  "work.title",
  "work.intro",
  "clients.title",
  "clients.body",
  "packages.title",
  "packages.intro",
  "praise.title",
  "contact.title",
  "contact.body",
]);

export const isRich = (path: string) => RICH_PATTERNS.has(patternOf(path));

const blankMedia = () => ({ url: "", alt: "", focus: "50% 50%" });

/** A fresh item for every list in the content, used by "add" buttons and to fill missing fields */
export const LIST_TEMPLATES: Record<string, () => Record<string, unknown>> = {
  "header.links": () => ({ id: newId("n"), label: "New link", href: "#contact" }),
  "footer.links": () => ({ id: newId("f"), label: "New link", href: "#contact" }),
  "hero.videos": () => ({ id: newId("v"), kind: "tiktok", url: "", embed: "", poster: "", title: "Client video", autoplay: false }),
  "marquee.items": () => ({ id: newId("m"), text: "New service" }),
  "loader.words": () => ({ id: newId("lw"), text: "New word" }),
  "meet.paragraphs": () => ({ id: newId("mp"), text: "A new paragraph about you." }),
  "services.items": () => ({ id: newId("s"), num: "07", title: "New service", body: "Describe what this service includes." }),
  "work.items": () => ({ id: newId("g"), label: "new project", image: blankMedia() }),
  "packages.items": () => ({
    id: newId("p"),
    name: "New package",
    tag: "Custom",
    price: "$0",
    cta: "Choose package",
    featured: false,
    features: [{ id: newId("pf"), text: "What's included" }],
  }),
  "packages.items.*.features": () => ({ id: newId("pf"), text: "What's included" }),
  "praise.quotes": () => ({ id: newId("q"), text: "What your client said about working with you.", name: "Client name", role: "Role, Business" }),
  "contact.details": () => ({ id: newId("c"), label: "Label", value: "Value", href: "" }),
  "contact.form.packageOptions": () => ({ id: newId("o"), text: "New option" }),
  "footer.socials": () => ({ id: newId("so"), platform: "tiktok", url: "https://www.tiktok.com/@" }),
};

const SECTION_IDS: SectionId[] = DEFAULT_CONTENT.sections.order;
const ENUMS: Record<string, string[]> = {
  "settings.theme": ["auto", "dark", "light"],
  "hero.videos.*.kind": ["tiktok", "facebook", "instagram", "youtube", "upload"],
  "footer.socials.*.platform": ["facebook", "instagram", "tiktok", "youtube", "linkedin", "x"],
};

const MAX_LIST = 60;
const MAX_TEXT = 4000;

export function safeHref(v: string): string {
  const s = v.trim();
  if (s === "") return "";
  if (/^(#|\/(?!\/)|https?:\/\/|mailto:|tel:)/i.test(s)) return s.slice(0, 1000);
  if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(s)) return `mailto:${s}`;
  if (/^[\w-]+(\.[\w-]+)+(\/.*)?$/.test(s)) return `https://${s}`;
  return "#";
}

export function safeMediaUrl(v: string): string {
  const s = v.trim();
  return s === "" || /^(\/(?!\/)|https:\/\/)/.test(s) ? s.slice(0, 1000) : "";
}

type Options = { sanitizeRich: (html: string) => string };

/**
 * Coerces anything (a saved draft, an old document, a request body) into a complete SiteContent:
 * missing fields come from the defaults, unknown fields are dropped, text is length-capped,
 * rich text is sanitized, links are checked and video embeds are recomputed from their links.
 */
export function normalizeContent(input: unknown, opts: Options): SiteContent {
  const walk = (value: unknown, shape: unknown, path: string): unknown => {
    const pattern = patternOf(path);

    if (typeof shape === "string") {
      if (typeof value !== "string") return shape;
      const enumValues = ENUMS[pattern];
      if (enumValues) return enumValues.includes(value) ? value : shape;
      const key = path.split(".").pop()!;
      if (key === "href") return safeHref(value);
      if (key === "url" || key === "poster" || key === "ogImage") {
        return pattern === "footer.socials.*.url" || pattern === "hero.videos.*.url" ? safeHref(value).slice(0, 1000) : safeMediaUrl(value);
      }
      if (key === "accent") return /^#[0-9a-f]{6}$/i.test(value) ? value : shape;
      const text = value.slice(0, MAX_TEXT);
      return RICH_PATTERNS.has(pattern) ? opts.sanitizeRich(text) : text.replace(/<[^>]*>/g, "");
    }
    if (typeof shape === "boolean") return typeof value === "boolean" ? value : shape;
    if (typeof shape === "number") return typeof value === "number" && Number.isFinite(value) ? value : shape;

    if (Array.isArray(shape)) {
      if (pattern === "sections.order") {
        const list = Array.isArray(value) ? value.filter((v): v is SectionId => SECTION_IDS.includes(v as SectionId)) : [];
        const unique = [...new Set(list)];
        // Sections added in a later version of the site get appended so they never silently disappear
        return [...unique, ...SECTION_IDS.filter((s) => !unique.includes(s))];
      }
      if (pattern === "sections.hidden") {
        return Array.isArray(value) ? [...new Set(value.filter((v) => SECTION_IDS.includes(v as SectionId)))] : [];
      }
      if (!Array.isArray(value)) return shape;
      const template = LIST_TEMPLATES[pattern];
      const itemShape = template ? template() : shape[0];
      const seen = new Set<string>();
      return value.slice(0, MAX_LIST).map((item, i) => {
        const out = walk(item, itemShape, `${path}.${i}`) as Record<string, unknown>;
        if (typeof out.id === "string") {
          if (!/^[\w-]{1,40}$/.test(out.id) || seen.has(out.id)) out.id = newId();
          seen.add(out.id as string);
        }
        return out;
      });
    }

    if (shape && typeof shape === "object") {
      const src = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(shape)) {
        out[key] = walk(src[key], (shape as Record<string, unknown>)[key], path ? `${path}.${key}` : key);
      }
      if (pattern === "hero.videos.*") return fixVideo(out);
      return out;
    }
    return shape;
  };

  return walk(input, DEFAULT_CONTENT, "") as SiteContent;
}

function fixVideo(v: Record<string, unknown>) {
  if (v.kind === "upload") {
    v.embed = "";
    if (typeof v.url === "string" && !/^https:\/\//.test(v.url)) v.url = "";
    return v;
  }
  const parsed = typeof v.url === "string" ? parseVideoUrl(v.url) : null;
  if (parsed) {
    v.kind = parsed.kind;
    v.embed = parsed.embed;
  } else if (typeof v.embed !== "string" || !isAllowedEmbed(v.embed)) {
    v.embed = "";
  }
  return v;
}
