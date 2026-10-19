import { adminRoute } from "@/lib/server/api";
import { ensureSeeded, getDraft, saveDraft } from "@/lib/server/content";

export const GET = adminRoute(async () => {
  await ensureSeeded();
  return getDraft();
});

export const PUT = adminRoute(async (req, user) => {
  const body = (await req.json()) as { content?: unknown };
  if (!body.content || typeof body.content !== "object") throw new Error("Missing content.");
  const saved = await saveDraft(body.content, user.email);
  return { updatedAt: saved.updatedAt };
});
