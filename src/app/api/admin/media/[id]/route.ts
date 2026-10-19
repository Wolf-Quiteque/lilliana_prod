import { ObjectId } from "mongodb";
import { adminRoute } from "@/lib/server/api";
import { col, getDb } from "@/lib/server/db";
import { deleteObject } from "@/lib/server/r2";

export const DELETE = adminRoute<{ params: Promise<{ id: string }> }>(async (_req, _user, ctx) => {
  const { id } = await ctx.params;
  if (!ObjectId.isValid(id)) throw new Error("Unknown file.");
  const db = await getDb();
  const doc = await col.media(db).findOne({ _id: new ObjectId(id) });
  if (!doc) return { ok: true };
  await deleteObject(doc.key);
  if (doc.posterKey) await deleteObject(doc.posterKey).catch(() => {});
  await col.media(db).deleteOne({ _id: doc._id });
  return { ok: true };
});
