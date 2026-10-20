import { adminRoute } from "@/lib/server/api";
import { needsResolving, parseVideoUrl } from "@/lib/content/embeds";

async function resolve(url: string): Promise<string> {
  // Follow share/short links (vm.tiktok.com, fb.watch, facebook.com/share/...) to the real address
  let current = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(current, {
      method: "GET",
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15" },
      signal: AbortSignal.timeout(6000),
    });
    const next = res.headers.get("location");
    if (!next || res.status < 300 || res.status >= 400) break;
    const target = new URL(next, current);
    // Only ever follow redirects within the video platforms
    if (target.protocol !== "https:" || !/(^|\.)(tiktok\.com|facebook\.com|fb\.watch|instagram\.com|youtube\.com|youtu\.be)$/.test(target.hostname)) break;
    current = target.toString();
    if (parseVideoUrl(current) && !needsResolving(current)) break;
  }
  return current;
}

export const POST = adminRoute(async (req) => {
  const { url } = (await req.json()) as { url?: string };
  if (typeof url !== "string" || !url.trim()) throw new Error("Paste a video link first.");
  let link = url.trim();
  if (!/^https?:\/\//i.test(link)) link = `https://${link}`;
  if (needsResolving(link)) {
    try {
      link = await resolve(link);
    } catch {
      /* fall through to parsing what we have */
    }
  }
  const parsed = parseVideoUrl(link);
  if (!parsed) {
    throw new Error("That link isn't a video we can show. Use a TikTok, Facebook, Instagram or YouTube video link (open the video and copy the link from the address bar or the Share button).");
  }
  if (parsed.kind === "youtube") await assertYouTubeEmbeddable(parsed.url);
  return parsed;
});

/**
 * YouTube's oEmbed answers 401 when the owner has turned off playback on other websites, and
 * 400/404 when the video is private or gone. Without this check the card would just say
 * "Video unavailable" on the live site. Network trouble never blocks the link.
 */
async function assertYouTubeEmbeddable(url: string) {
  let status = 0;
  try {
    const res = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(5000) });
    status = res.status;
  } catch {
    return;
  }
  if (status === 401 || status === 403) {
    throw new Error("The owner of this YouTube video doesn't allow it to be played on other websites. Pick another video, or download it and use Upload instead.");
  }
  if (status === 400 || status === 404) throw new Error("That YouTube video doesn't exist or is private.");
}
