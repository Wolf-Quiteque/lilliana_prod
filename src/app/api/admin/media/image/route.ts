import { ObjectId } from "mongodb";
import { adminRoute } from "@/lib/server/api";
import { col, getDb, type MediaDoc } from "@/lib/server/db";
import { optimizeImage } from "@/lib/server/image";
import { cleanName, toMediaItem } from "@/lib/server/media";
import { newKey, putObject } from "@/lib/server/r2";

export const POST = adminRoute(async (req) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof Blob) || file.size === 0) throw new Error("No image received.");
  if (file.size > 4.4 * 1024 * 1024) throw new Error("That image is too large.");
  const input = Buffer.from(await file.arrayBuffer());
  let out;
  try {
    out = await optimizeImage(input);
  } catch {
    throw new Error("That file isn't an image we can read. Try a JPG or PNG.");
  }
  const key = newKey("images", "webp");
  const url = await putObject(key, out.data, "image/webp");
  const originalSize = Number(form.get("originalSize")) || file.size;
  const doc: MediaDoc = {
    _id: new ObjectId(),
    type: "image",
    key,
    url,
    contentType: "image/webp",
    size: out.data.length,
    originalSize,
    width: out.width,
    height: out.height,
    name: cleanName(file instanceof File ? file.name : "image"),
    createdAt: new Date(),
  };
  await col.media(await getDb()).insertOne(doc);
  return toMediaItem(doc);
});
