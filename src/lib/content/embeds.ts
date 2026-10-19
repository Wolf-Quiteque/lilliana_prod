import type { VideoKind } from "./types";

// Turns a link pasted by the admin into an embeddable iframe URL. Only these hosts can ever end up
// in an iframe on the site; the server recomputes `embed` from `url` on every save.

export type ParsedVideo = { kind: Exclude<VideoKind, "upload">; url: string; embed: string };

const SHORT_HOSTS = ["vm.tiktok.com", "vt.tiktok.com", "fb.watch", "youtu.be"];

function asUrl(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u : null;
  } catch {
    return null;
  }
}

/** Short links that must be followed (on the server) before they can be embedded */
export function needsResolving(raw: string): boolean {
  const u = asUrl(raw);
  if (!u) return false;
  const host = u.hostname.replace(/^www\./, "");
  if (SHORT_HOSTS.includes(host) && host !== "youtu.be") return true;
  if (host.endsWith("tiktok.com") && /^\/t\//.test(u.pathname)) return true;
  if (host.endsWith("facebook.com") && /^\/share\//.test(u.pathname)) return true;
  return false;
}

export function parseVideoUrl(raw: string): ParsedVideo | null {
  const u = asUrl(raw);
  if (!u) return null;
  const host = u.hostname.replace(/^(www|m|mobile|web)\./, "");
  const url = u.toString();

  if (host === "tiktok.com" || host.endsWith(".tiktok.com")) {
    const id = u.pathname.match(/\/(?:video|photo|embed\/v2|embed|v)\/(\d{8,25})/)?.[1];
    return id ? { kind: "tiktok", url, embed: `https://www.tiktok.com/embed/v2/${id}` } : null;
  }

  if (host === "youtube.com" || host === "youtu.be" || host === "youtube-nocookie.com") {
    let id: string | null = null;
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0];
    else if (u.pathname === "/watch") id = u.searchParams.get("v");
    else id = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{6,20})/)?.[1] ?? null;
    return id && /^[\w-]{6,20}$/.test(id)
      ? { kind: "youtube", url, embed: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1` }
      : null;
  }

  if (host === "instagram.com") {
    const m = u.pathname.match(/^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]{5,40})/);
    if (!m) return null;
    const type = m[1] === "reels" ? "reel" : m[1];
    return { kind: "instagram", url, embed: `https://www.instagram.com/${type}/${m[2]}/embed/` };
  }

  if (host === "facebook.com" || host === "fb.watch") {
    const isVideo = /\/(videos|reel|watch|share\/v|share\/r)\b/.test(u.pathname) || u.searchParams.has("v") || host === "fb.watch";
    if (!isVideo) return null;
    const href = encodeURIComponent(url);
    return {
      kind: "facebook",
      url,
      embed: `https://www.facebook.com/plugins/video.php?href=${href}&show_text=false&width=500`,
    };
  }

  return null;
}

const EMBED_PREFIXES = [
  "https://www.tiktok.com/embed/v2/",
  "https://www.youtube-nocookie.com/embed/",
  "https://www.instagram.com/",
  "https://www.facebook.com/plugins/video.php?",
];

export function isAllowedEmbed(src: string): boolean {
  return EMBED_PREFIXES.some((p) => src.startsWith(p));
}

export const VIDEO_KIND_LABELS: Record<VideoKind, string> = {
  tiktok: "TikTok",
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  upload: "Uploaded video",
};
