"use client";

// Upload helpers for the editor. Images are shrunk in the browser (so phone photos fit through the
// upload limit) and finished on the server as WebP. Videos are re-encoded in the browser with
// WebCodecs (hardware accelerated, H.264/AAC MP4) and then sent straight to storage.

export type MediaItem = {
  id: string;
  type: "image" | "video";
  url: string;
  poster?: string;
  width?: number;
  height?: number;
  duration?: number;
  size: number;
  originalSize?: number;
  name: string;
  createdAt: string;
};

export async function api<T = unknown>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: init?.json !== undefined ? { "content-type": "application/json", ...init?.headers } : init?.headers,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401) {
    window.location.href = "/admin/login";
    throw new Error("Please sign in again.");
  }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

/* ------------------------------------------------------------------ images */

const IMAGE_MAX = 2400;

async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // let the server try (e.g. HEIC on browsers that can't decode it)
  }
  const scale = Math.min(1, IMAGE_MAX / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size < 3.5 * 1024 * 1024) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const toBlob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  const webp = await toBlob("image/webp", 0.9);
  if (webp && webp.type === "image/webp") return webp;
  return (await toBlob("image/jpeg", 0.9)) ?? file;
}

export async function uploadImage(file: File | Blob, name = "image"): Promise<MediaItem> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Please choose a photo (JPG, PNG, WebP, HEIC or GIF).");
  const blob = file instanceof File ? await shrinkImage(file) : file;
  if (blob.size > 4.3 * 1024 * 1024) throw new Error("That image is too large. Try a smaller photo.");
  const form = new FormData();
  form.append("file", blob, file instanceof File ? file.name : name);
  form.append("originalSize", String(file.size));
  return api<MediaItem>("/api/admin/media/image", { method: "POST", body: form });
}

/* ------------------------------------------------------------------ videos */

export type VideoPreset = "balanced" | "high";

export const VIDEO_PRESETS: Record<VideoPreset, { label: string; short: number; bitrate: number; hint: string }> = {
  balanced: { label: "Balanced — 720p", short: 720, bitrate: 2_300_000, hint: "Recommended. Looks sharp on phones and in the video cards, smallest files." },
  high: { label: "High — 1080p", short: 1080, bitrate: 4_800_000, hint: "For videos that may be watched full screen. About twice the size." },
};

export type VideoProgress = { stage: "prepare" | "compress" | "upload" | "finish"; progress: number; note?: string };

const MAX_SECONDS = 15 * 60;
const MAX_ORIGINAL_UPLOAD = 250 * 1024 * 1024;

export function canCompressVideo() {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window;
}

export async function uploadVideo(
  file: File,
  preset: VideoPreset,
  onProgress: (p: VideoProgress) => void,
  signal: AbortSignal,
): Promise<MediaItem> {
  if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name)) throw new Error("Please choose a video file.");
  onProgress({ stage: "prepare", progress: 0 });

  const mb = await import("mediabunny");
  const input = new mb.Input({ formats: mb.ALL_FORMATS, source: new mb.BlobSource(file) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) throw new Error("This file has no video in it.");
  const duration = await input.computeDuration();
  if (duration > MAX_SECONDS) throw new Error("Videos can be at most 15 minutes long.");

  const srcW = track.displayWidth;
  const srcH = track.displayHeight;
  const { short, bitrate: baseBitrate } = VIDEO_PRESETS[preset];
  const scale = Math.min(1, short / Math.min(srcW, srcH));
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const width = even(srcW * scale);
  const height = even(srcH * scale);
  // Smaller sources need fewer bits for the same quality
  const bitrate = Math.max(900_000, Math.round(baseBitrate * Math.min(1, (width * height) / (short * short * (16 / 9)))));

  // Still frame for the poster, taken from the source before compressing
  let posterBlob: Blob | null = null;
  try {
    if (await track.canDecode()) {
      const sink = new mb.CanvasSink(track, { width: Math.min(720, width), fit: "contain" });
      const frame = await sink.getCanvas(Math.min(1, duration / 4));
      if (frame) posterBlob = await canvasToBlob(frame.canvas);
    }
  } catch {
    posterBlob = null;
  }

  let output: Blob = file;
  let note: string | undefined;
  const canEncode = canCompressVideo() && (await mb.canEncodeVideo("avc", { width, height, bitrate }));

  if (canEncode && (await track.canDecode())) {
    const stats = await track.computePacketStats(120).catch(() => null);
    const fps = stats?.averagePacketRate ?? 30;
    const audioCodec = (await mb.canEncodeAudio("aac")) ? "aac" : "opus";
    const out = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
    const conversion = await mb.Conversion.init({
      input,
      output: out,
      tracks: "primary",
      video: {
        width,
        height,
        fit: "fill",
        codec: "avc",
        quality: new mb.Quality({ bitrate, bitrateMode: "variable" }),
        frameRate: fps > 31 ? 30 : undefined,
        keyFrameInterval: 2,
        forceTranscode: true,
      },
      audio: { codec: audioCodec, quality: new mb.Quality({ bitrate: 128_000 }), numberOfChannels: 2 },
      tags: {},
      showWarnings: false,
    });
    if (!conversion.isValid) throw new Error("This video format can't be processed in this browser. Try exporting it as MP4 first.");
    conversion.onProgress = (p) => onProgress({ stage: "compress", progress: p });
    const abort = () => void conversion.cancel();
    signal.addEventListener("abort", abort);
    try {
      await conversion.execute();
    } finally {
      signal.removeEventListener("abort", abort);
    }
    const buffer = (out.target as InstanceType<typeof mb.BufferTarget>).buffer;
    if (!buffer) throw new Error("Compression produced no output.");
    const compressed = new Blob([buffer], { type: "video/mp4" });
    // Already-small clips can come out larger; keep whichever is smaller if the original is MP4
    output = compressed.size < file.size || file.type !== "video/mp4" ? compressed : file;
  } else {
    if (file.size > MAX_ORIGINAL_UPLOAD) throw new Error("This browser can't compress videos and the file is over 250 MB. Try Chrome, Edge or Safari.");
    note = "This browser can't compress video, so the original file was uploaded.";
  }
  if (signal.aborted) throw new DOMException("Cancelled", "AbortError");

  onProgress({ stage: "upload", progress: 0, note });
  let poster = "";
  if (posterBlob) {
    try {
      poster = (await uploadImage(posterBlob, "poster.webp")).url;
    } catch {
      poster = "";
    }
  }

  const contentType = output.type || "video/mp4";
  const signed = await api<{ id: string; uploadUrl: string; url: string }>("/api/admin/media/video/sign", {
    method: "POST",
    json: { size: output.size, contentType, name: file.name },
  });
  await putWithProgress(signed.uploadUrl, output, contentType, (p) => onProgress({ stage: "upload", progress: p }), signal);

  onProgress({ stage: "finish", progress: 1 });
  return api<MediaItem>("/api/admin/media/video/complete", {
    method: "POST",
    json: { id: signed.id, width, height, duration, poster, originalSize: file.size },
  });
}

function canvasToBlob(canvas: HTMLCanvasElement | OffscreenCanvas): Promise<Blob | null> {
  if ("convertToBlob" in canvas) return canvas.convertToBlob({ type: "image/webp", quality: 0.85 });
  return new Promise((r) => canvas.toBlob(r, "image/webp", 0.85));
}

function putWithProgress(url: string, body: Blob, contentType: string, onProgress: (p: number) => void, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("content-type", contentType);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status}).`)));
    xhr.onerror = () => reject(new Error("Upload failed. Check your connection and try again."));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    signal.addEventListener("abort", () => xhr.abort());
    xhr.send(body);
  });
}

export function formatBytes(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}
