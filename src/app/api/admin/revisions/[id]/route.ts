import { adminRoute } from "@/lib/server/api";
import { restoreRevision } from "@/lib/server/content";

export const POST = adminRoute<{ params: Promise<{ id: string }> }>(async (_req, user, ctx) => {
  const { id } = await ctx.params;
  return restoreRevision(id, user.email);
});
