import "server-only";
import { getDb } from "./db";

type Bucket = { _id: string; count: number; expiresAt: Date };

let indexed = false;

/** Fixed-window limit stored in MongoDB, so it holds across serverless instances. True = allowed. */
export async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const db = await getDb();
  const coll = db.collection<Bucket>("ratelimits");
  if (!indexed) {
    await coll.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    indexed = true;
  }
  const now = new Date();
  const hit = await coll.findOneAndUpdate({ _id: key, expiresAt: { $gt: now } }, { $inc: { count: 1 } }, { returnDocument: "after" });
  if (hit) return hit.count <= limit;
  await coll.updateOne({ _id: key }, { $set: { count: 1, expiresAt: new Date(now.getTime() + windowSeconds * 1000) } }, { upsert: true });
  return true;
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}
