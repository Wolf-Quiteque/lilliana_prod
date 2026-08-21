"use strict";

// Shared browser-side image pipeline. Every admin/live-editor upload is resized
// and encoded as WebP before it reaches the API or Cloudflare R2.
window.LillisImages = {
  async toWebp(file, { maxDimension = 2400, quality = 0.84 } = {}) {
    if (!file || !String(file.type).startsWith("image/")) throw new Error("Choose an image file.");
    const image = typeof createImageBitmap === "function" ? await createImageBitmap(file) : await loadImage(file);
    const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d", { alpha: true }).drawImage(image, 0, 0, width, height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (typeof image.close === "function") image.close();
    if (!blob) throw new Error("Your browser could not prepare this image as WebP.");
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.webp`, { type: "image/webp" });
  }
};

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("This image could not be read.")); };
    image.src = url;
  });
}
