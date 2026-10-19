import { adminRoute } from "@/lib/server/api";
import { listRevisions } from "@/lib/server/content";

export const GET = adminRoute(async () => ({ revisions: await listRevisions() }));
