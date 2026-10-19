import { adminRoute } from "@/lib/server/api";
import type { Filter } from "mongodb";
import { col, getDb, type MediaDoc } from "@/lib/server/db";
import { toMediaItem } from "@/lib/server/media";

export const GET = adminRoute(async (req) => {
  const type = new URL(req.url).searchParams.get("type");
  const filter: Filter<MediaDoc> = { pending: { $ne: true } };
  if (type === "image" || type === "video") filter.type = type;
  const docs = await col.media(await getDb()).find(filter).sort({ createdAt: -1 }).limit(300).toArray();
  return { items: docs.map(toMediaItem) };
});
