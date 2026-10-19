import "server-only";
import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// The bucket is shared with other projects, so everything for this site lives under one prefix
// and nothing outside it is ever deleted.
export const R2_PREFIX = "lilli/";

const env = {
  endpoint: process.env.R2_ENDPOINT,
  accessKeyId: process.env.R2_ACCESS_KEY_ID,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  bucket: process.env.R2_BUCKET_NAME,
  publicUrl: process.env.R2_PUBLIC_URL?.replace(/\/+$/, ""),
};

export const r2Configured = Object.values(env).every(Boolean);

let client: S3Client | null = null;
function s3() {
  if (!r2Configured) throw new Error("R2 storage is not configured.");
  client ??= new S3Client({
    region: "auto",
    endpoint: env.endpoint,
    credentials: { accessKeyId: env.accessKeyId!, secretAccessKey: env.secretAccessKey! },
  });
  return client;
}

export const publicUrlFor = (key: string) => `${env.publicUrl}/${key}`;

export function newKey(folder: "images" | "videos" | "posters", ext: string) {
  const now = new Date();
  return `${R2_PREFIX}${folder}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${ext}`;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  await s3().send(
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return publicUrlFor(key);
}

/** A short-lived URL the browser can PUT a large file to directly (videos skip the 4.5 MB function limit) */
export async function signedPutUrl(key: string, contentType: string, size: number) {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: env.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: size,
      CacheControl: "public, max-age=31536000, immutable",
    }),
    { expiresIn: 60 * 30, signableHeaders: new Set(["content-type", "content-length"]) },
  );
}

export async function deleteObject(key: string) {
  if (!key.startsWith(R2_PREFIX)) throw new Error(`Refused: ${key} does not belong to this site.`);
  await s3().send(new DeleteObjectCommand({ Bucket: env.bucket, Key: key }));
}
