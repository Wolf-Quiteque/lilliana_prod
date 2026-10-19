import { ObjectId } from "mongodb";
import { adminRoute } from "@/lib/server/api";
import { col, getDb } from "@/lib/server/db";
import { cleanName } from "@/lib/server/media";
import { newKey, publicUrlFor, signedPutUrl } from "@/lib/server/r2";

const TYPES: Record<string, string> = { "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm", "video/x-m4v": "m4v" };
const MAX = 300 * 1024 * 1024;

export const POST = adminRoute(async (req) => {
  const { size, contentType, name } = (await req.json()) as { size?: number; contentType?: string; name?: string };
  const ext = contentType ? TYPES[contentType] : undefined;
  if (!ext) throw new Error("Only MP4, MOV and WebM videos are supported.");
  if (typeof size !== "number" || size <= 0 || size > MAX) throw new Error("Videos can be at most 300 MB after compression.");
  const key = newKey("videos", ext);
  const uploadUrl = await signedPutUrl(key, contentType!, size);
  const _id = new ObjectId();
  await col.media(await getDb()).insertOne({
    _id,
    type: "video",
    key,
    url: publicUrlFor(key),
    contentType: contentType!,
    size,
    name: cleanName(name),
    pending: true,
    createdAt: new Date(),
  });
  return { id: _id.toHexString(), uploadUrl, url: publicUrlFor(key) };
});
