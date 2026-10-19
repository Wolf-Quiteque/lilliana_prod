import { adminRoute } from "@/lib/server/api";
import { publishDraft, saveDraft } from "@/lib/server/content";

export const POST = adminRoute(async (req, user) => {
  const body = (await req.json().catch(() => ({}))) as { content?: unknown };
  // The editor sends its latest state so nothing typed in the last second is lost
  if (body.content && typeof body.content === "object") await saveDraft(body.content, user.email);
  const publishedAt = await publishDraft(user.email);
  return { publishedAt };
});
