import { ObjectId } from "mongodb";
import { adminRoute } from "@/lib/server/api";
import { col, getDb } from "@/lib/server/db";
import { toMediaItem } from "@/lib/server/media";
import { R2_PREFIX } from "@/lib/server/r2";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : undefined);

export const POST = adminRoute(async (req) => {
  const body = (await req.json()) as Record<string, unknown>;
  if (typeof body.id !== "string" || !ObjectId.isValid(body.id)) throw new Error("Unknown upload.");
  const db = await getDb();
  const doc = await col.media(db).findOne({ _id: new ObjectId(body.id), type: "video" });
  if (!doc) throw new Error("Unknown upload.");

  // Confirm the file really landed in storage before listing it
  const head = await fetch(doc.url, { method: "HEAD", cache: "no-store" }).catch(() => null);
  if (!head?.ok) throw new Error("The video didn't finish uploading. Please try again.");

  const poster = typeof body.poster === "string" && /^https:\/\//.test(body.poster) ? body.poster : undefined;
  const posterDoc = poster ? await col.media(db).findOne({ url: poster }) : null;
  const update = {
    pending: false,
    width: num(body.width),
    height: num(body.height),
    duration: num(body.duration),
    originalSize: num(body.originalSize),
    poster,
    posterKey: posterDoc?.key.startsWith(R2_PREFIX) ? posterDoc.key : undefined,
  };
  // The poster belongs to the video now; hide it from the image library
  if (posterDoc) await col.media(db).deleteOne({ _id: posterDoc._id });
  const updated = await col.media(db).findOneAndUpdate({ _id: doc._id }, { $set: update }, { returnDocument: "after" });
  return toMediaItem(updated!);
});
