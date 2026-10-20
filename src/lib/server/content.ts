import "server-only";
import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { DEFAULT_CONTENT } from "@/lib/content/defaults";
import { normalizeContent } from "@/lib/content/schema";
import type { SiteContent } from "@/lib/content/types";
import { ObjectId } from "mongodb";
import { col, dbConfigured, getDb } from "./db";
import { sanitizeRich } from "./sanitize";

export const normalize = (input: unknown) => normalizeContent(input, { sanitizeRich });

const KEEP_REVISIONS = 30;

/** What visitors see. Cached until the next publish; falls back to the built-in content. */
export const getPublishedContent = unstable_cache(
  async (): Promise<SiteContent> => {
    if (!dbConfigured) return DEFAULT_CONTENT;
    try {
      const doc = await col.content(await getDb()).findOne({ _id: "published" });
      return doc ? normalize(doc.content) : DEFAULT_CONTENT;
    } catch (err) {
      console.error("[content] could not read published content", err);
      return DEFAULT_CONTENT;
    }
  },
  ["published-content", "embeds-v2"],
  { tags: ["content"], revalidate: 3600 },
);

export async function getDraft(): Promise<{ content: SiteContent; updatedAt: Date | null; publishedAt: Date | null; hasUnpublished: boolean }> {
  const db = await getDb();
  const [draft, published] = await Promise.all([
    col.content(db).findOne({ _id: "draft" }),
    col.content(db).findOne({ _id: "published" }),
  ]);
  const content = normalize(draft?.content ?? published?.content ?? DEFAULT_CONTENT);
  return {
    content,
    updatedAt: draft?.updatedAt ?? null,
    publishedAt: published?.updatedAt ?? null,
    hasUnpublished: Boolean(draft && (!published || draft.updatedAt > published.updatedAt)),
  };
}

export async function saveDraft(input: unknown, by: string) {
  const content = normalize(input);
  const updatedAt = new Date();
  await col.content(await getDb()).updateOne({ _id: "draft" }, { $set: { content, updatedAt, updatedBy: by } }, { upsert: true });
  return { content, updatedAt };
}

export async function publishDraft(by: string) {
  const db = await getDb();
  const draft = await col.content(db).findOne({ _id: "draft" });
  if (!draft) throw new Error("There is nothing to publish yet.");
  const content = normalize(draft.content);
  const now = new Date();
  await col.content(db).updateOne({ _id: "published" }, { $set: { content, updatedAt: now, updatedBy: by } }, { upsert: true });
  // Draft timestamp moves with the publish so "unpublished changes" resets
  await col.content(db).updateOne({ _id: "draft" }, { $set: { updatedAt: now } });
  await col.revisions(db).insertOne({ _id: new ObjectId(), content, publishedAt: now, publishedBy: by });
  const old = await col.revisions(db).find({}, { projection: { _id: 1 } }).sort({ publishedAt: -1 }).skip(KEEP_REVISIONS).toArray();
  if (old.length) await col.revisions(db).deleteMany({ _id: { $in: old.map((o) => o._id) } });
  revalidateTag("content", { expire: 0 });
  revalidatePath("/");
  return now;
}

export async function listRevisions() {
  const db = await getDb();
  const docs = await col.revisions(db).find({}, { projection: { content: 0 } }).sort({ publishedAt: -1 }).limit(KEEP_REVISIONS).toArray();
  return docs.map((d) => ({ id: d._id.toHexString(), publishedAt: d.publishedAt, publishedBy: d.publishedBy ?? "" }));
}

export async function restoreRevision(id: string, by: string) {
  const db = await getDb();
  if (!ObjectId.isValid(id)) throw new Error("Unknown version.");
  const rev = await col.revisions(db).findOne({ _id: new ObjectId(id) });
  if (!rev) throw new Error("That version no longer exists.");
  return saveDraft(rev.content, by);
}

export async function discardDraft(by: string) {
  const db = await getDb();
  const published = await col.content(db).findOne({ _id: "published" });
  return saveDraft(published?.content ?? DEFAULT_CONTENT, by);
}

/** Creates the published document from the built-in content the first time the site runs */
export async function ensureSeeded() {
  const db = await getDb();
  const exists = await col.content(db).findOne({ _id: "published" }, { projection: { _id: 1 } });
  if (exists) return false;
  const now = new Date();
  await col.content(db).updateOne(
    { _id: "published" },
    { $setOnInsert: { content: DEFAULT_CONTENT, updatedAt: now, updatedBy: "seed" } },
    { upsert: true },
  );
  return true;
}
