// The whole editable website lives in one SiteContent document. Every list item carries a stable
// `id` so React keys survive reordering in the editor.

export type Media = {
  url: string;
  alt: string;
  /** CSS object-position, e.g. "50% 30%" */
  focus: string;
};

export type LinkItem = { id: string; label: string; href: string };

export type TextItem = { id: string; text: string };

export type VideoKind = "tiktok" | "facebook" | "instagram" | "youtube" | "upload";

export type VideoItem = {
  id: string;
  kind: VideoKind;
  /** The link the admin pasted (embeds) or the uploaded file URL (uploads) */
  url: string;
  /** iframe src, always derived from `url` on the server */
  embed: string;
  /** Still frame shown before an uploaded video plays */
  poster: string;
  title: string;
  /** Uploaded videos only: play muted on a loop like a reel */
  autoplay: boolean;
};

export type SocialPlatform = "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin" | "x";

export type SectionId = "hero" | "marquee" | "meet" | "services" | "work" | "clients" | "packages" | "praise" | "contact";

export type SiteContent = {
  version: 1;
  settings: {
    theme: "auto" | "dark" | "light";
    accent: string;
    showPricing: boolean;
    seoTitle: string;
    seoDescription: string;
    ogImage: string;
  };
  loader: {
    enabled: boolean;
    status: string;
    done: string;
    words: TextItem[];
    brand: string;
  };
  brand: { name: string; logo: Media };
  header: { links: LinkItem[]; cta: LinkItem; call: LinkItem };
  sections: { order: SectionId[]; hidden: SectionId[] };
  hero: {
    eyebrow: string;
    title: string;
    body: string;
    primary: LinkItem;
    secondary: LinkItem;
    phone: LinkItem;
    videosLabel: string;
    videos: VideoItem[];
  };
  marquee: { items: TextItem[] };
  meet: { eyebrow: string; title: string; paragraphs: TextItem[]; photo: Media; placeholder: string };
  services: { eyebrow: string; title: string; intro: string; items: { id: string; num: string; title: string; body: string }[] };
  work: { eyebrow: string; title: string; intro: string; items: { id: string; label: string; image: Media }[] };
  clients: { eyebrow: string; title: string; body: string; image: Media };
  packages: {
    eyebrow: string;
    title: string;
    intro: string;
    period: string;
    items: { id: string; name: string; tag: string; price: string; cta: string; featured: boolean; features: TextItem[] }[];
    note: string;
    noteLink: LinkItem;
  };
  praise: { eyebrow: string; title: string; quotes: { id: string; text: string; name: string; role: string }[] };
  contact: {
    eyebrow: string;
    title: string;
    body: string;
    details: { id: string; label: string; value: string; href: string }[];
    form: {
      nameLabel: string;
      namePlaceholder: string;
      emailLabel: string;
      emailPlaceholder: string;
      businessLabel: string;
      businessPlaceholder: string;
      packageLabel: string;
      packageOptions: TextItem[];
      messageLabel: string;
      messagePlaceholder: string;
      submit: string;
      note: string;
      sentNote: string;
      mailTo: string;
    };
  };
  footer: { links: LinkItem[]; copyright: string; socials: { id: string; platform: SocialPlatform; url: string }[] };
};

export const SECTION_LABELS: Record<SectionId, string> = {
  hero: "Hero & client videos",
  marquee: "Scrolling strip",
  meet: "Meet Lilli",
  services: "Services",
  work: "Gallery",
  clients: "Clients banner",
  packages: "Packages",
  praise: "Testimonials",
  contact: "Contact",
};
