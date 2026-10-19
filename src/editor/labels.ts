import { patternOf } from "@/lib/content/paths";
import { SECTION_LABELS, type SectionId } from "@/lib/content/types";

export type Group = { id: string; label: string; section?: SectionId };

/** Everything the editor can open in the side panel, in page order */
export const SITE_GROUPS: Group[] = [
  { id: "header", label: "Header & menu" },
  ...(Object.keys(SECTION_LABELS) as SectionId[]).map((id) => ({ id, label: SECTION_LABELS[id], section: id })),
  { id: "footer", label: "Footer" },
];

export const SETTINGS_GROUPS: Group[] = [
  { id: "settings", label: "Look & search engines" },
  { id: "brand", label: "Name & logo" },
  { id: "loader", label: "Intro loader" },
];

export const groupLabel = (id: string) => [...SITE_GROUPS, ...SETTINGS_GROUPS].find((g) => g.id === id)?.label ?? id;

const LABELS: Record<string, string> = {
  "settings.theme": "Default colour mode",
  "settings.accent": "Accent colour",
  "settings.showPricing": "Show prices on packages",
  "settings.seoTitle": "Page title (Google & browser tab)",
  "settings.seoDescription": "Page description (Google)",
  "settings.ogImage": "Image when the site is shared",
  "brand.name": "Business name",
  "brand.logo": "Logo",
  "loader.enabled": "Show the intro loader",
  "loader.status": "Loading message",
  "loader.done": "Finished message",
  "loader.words": "Scrolling words",
  "loader.brand": "Brand line",
  "header.links": "Menu links",
  "header.cta": "Header button",
  "header.call": "Call link (mobile menu)",
  "hero.eyebrow": "Small label above the headline",
  "hero.title": "Headline",
  "hero.body": "Intro text",
  "hero.primary": "Main button",
  "hero.secondary": "Second button",
  "hero.phone": "Phone link",
  "hero.videosLabel": "Videos description (screen readers)",
  "hero.videos": "Client videos",
  "marquee.items": "Scrolling words",
  "meet.eyebrow": "Small label",
  "meet.title": "Title",
  "meet.paragraphs": "Introduction paragraphs",
  "meet.photo": "Your photo",
  "meet.placeholder": "Text shown while there is no photo",
  "services.items": "Service cards",
  "services.items.*.num": "Number",
  "work.items": "Gallery tiles",
  "work.items.*.label": "Caption",
  "clients.image": "Image",
  "packages.period": "Price suffix",
  "packages.items": "Packages",
  "packages.items.*.tag": "Small label",
  "packages.items.*.cta": "Button text",
  "packages.items.*.featured": "Highlight this package",
  "packages.items.*.features": "What's included",
  "packages.note": "Note under the packages",
  "packages.noteLink": "Note link",
  "praise.quotes": "Testimonials",
  "praise.quotes.*.text": "Quote",
  "praise.quotes.*.role": "Role & business",
  "contact.details": "Contact details",
  "contact.details.*.href": "Link (phone/email, optional)",
  "contact.form": "Enquiry form",
  "contact.form.packageOptions": "Package choices",
  "contact.form.mailTo": "Send enquiries to (email)",
  "contact.form.note": "Note under the button",
  "contact.form.sentNote": "Message after sending",
  "contact.form.submit": "Button text",
  "footer.links": "Footer links",
  "footer.copyright": "Copyright line",
  "footer.socials": "Social media links",
  "footer.socials.*.url": "Profile link",
};

const HINTS: Record<string, string> = {
  "hero.title": "Select words and press Accent to colour them pink.",
  "settings.seoDescription": "About 150 characters works best.",
  "contact.form.mailTo": "The form opens the visitor's email app addressed to this inbox.",
  "meet.photo": "A portrait photo works best (about 4:5).",
  "packages.items.*.featured": "Gives the card the accent border and colour, like “Most popular”.",
};

export function fieldLabel(path: string): string {
  const pattern = patternOf(path);
  if (LABELS[pattern]) return LABELS[pattern];
  const key = path.split(".").pop() ?? "";
  if (key === "eyebrow") return "Small label";
  if (key === "intro" || key === "body") return "Text";
  if (key === "href") return "Link";
  if (key === "label") return "Text";
  if (key === "alt") return "Description (for accessibility)";
  return key.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}

export const fieldHint = (path: string) => HINTS[patternOf(path)];

/** A short name for a list item, shown in collapsed lists */
export function itemTitle(item: unknown, index: number): string {
  if (!item || typeof item !== "object") return `Item ${index + 1}`;
  const o = item as Record<string, unknown>;
  for (const key of ["name", "title", "label", "text", "platform", "value"]) {
    const v = o[key];
    if (typeof v === "string" && v.trim()) return v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  }
  if (o.kind) return `${String(o.kind)} video`;
  return `Item ${index + 1}`;
}

/** In-page anchors offered by link pickers */
export const ANCHORS = [
  { href: "#top", label: "Top of page" },
  { href: "#meet", label: "Meet Lilli" },
  { href: "#services", label: "Services" },
  { href: "#work", label: "Gallery" },
  { href: "#packages", label: "Packages" },
  { href: "#praise", label: "Testimonials" },
  { href: "#contact", label: "Contact" },
];
