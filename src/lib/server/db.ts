import "server-only";
import { MongoClient, type Db, type ObjectId } from "mongodb";
import type { SiteContent } from "@/lib/content/types";

const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB || "Lilli";

export const dbConfigured = Boolean(uri);

export type ContentDoc = { _id: "draft" | "published"; content: SiteContent; updatedAt: Date; updatedBy?: string };

export type RevisionDoc = { _id: ObjectId; content: SiteContent; publishedAt: Date; publishedBy?: string; note?: string };

export type UserDoc = {
  _id: ObjectId;
  email: string;
  passwordHash: string;
  /** Bumped to sign out every session of this user */
  sessionVersion: number;
  createdAt: Date;
  lastLoginAt?: Date;
};

export type MediaDoc = {
  _id: ObjectId;
  type: "image" | "video";
  key: string;
  url: string;
  contentType: string;
  size: number;
  originalSize?: number;
  width?: number;
  height?: number;
  duration?: number;
  poster?: string;
  posterKey?: string;
  name: string;
  /** Upload signed but not yet confirmed by the browser */
  pending?: boolean;
  createdAt: Date;
};

const g = globalThis as typeof globalThis & { _lilliMongo?: Promise<MongoClient> };

async function connect(): Promise<MongoClient> {
  const client = await new MongoClient(uri!, { maxPoolSize: 10, serverSelectionTimeoutMS: 8_000 }).connect();
  const db = client.db(dbName);
  await Promise.all([
    db.collection("users").createIndex({ email: 1 }, { unique: true }),
    db.collection("media").createIndex({ key: 1 }, { unique: true }),
    db.collection("media").createIndex({ createdAt: -1 }),
    db.collection("revisions").createIndex({ publishedAt: -1 }),
  ]);
  return client;
}

export async function getDb(): Promise<Db> {
  if (!uri) throw new Error("MONGODB_URI is not set");
  if (!g._lilliMongo) {
    g._lilliMongo = connect().catch((err) => {
      g._lilliMongo = undefined; // retry on the next request
      throw err;
    });
  }
  return (await g._lilliMongo).db(dbName);
}

export const col = {
  content: (db: Db) => db.collection<ContentDoc>("content"),
  revisions: (db: Db) => db.collection<RevisionDoc>("revisions"),
  users: (db: Db) => db.collection<UserDoc>("users"),
  media: (db: Db) => db.collection<MediaDoc>("media"),
  meta: (db: Db) => db.collection<{ _id: string; fingerprint?: string; at: Date }>("meta"),
};
