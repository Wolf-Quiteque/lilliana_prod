import { adminRoute } from "@/lib/server/api";
import { discardDraft } from "@/lib/server/content";

export const POST = adminRoute(async (_req, user) => discardDraft(user.email));
