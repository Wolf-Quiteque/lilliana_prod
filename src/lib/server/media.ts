import "server-only";
import type { MediaDoc } from "./db";

export const toMediaItem = (d: MediaDoc) => ({
  id: d._id.toHexString(),
  type: d.type,
  url: d.url,
  poster: d.poster,
  width: d.width,
  height: d.height,
  duration: d.duration,
  size: d.size,
  originalSize: d.originalSize,
  name: d.name,
  createdAt: d.createdAt.toISOString(),
});

export const cleanName = (name: unknown) =>
  (typeof name === "string" ? name : "file").replace(/[^\w.\- ()]/g, "").slice(0, 120) || "file";
