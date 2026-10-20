"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { VideoItem } from "@/lib/content/types";
import { EMBED_FRAME, VIDEO_KIND_LABELS } from "@/lib/content/embeds";
import { useEdit, useEditAttrs } from "./edit";

const IFRAME_PROPS = {
  loading: "lazy",
  allow: "autoplay; fullscreen; encrypted-media; picture-in-picture",
  allowFullScreen: true,
  referrerPolicy: "strict-origin-when-cross-origin",
} as const;

export function VideoCard({ video, path }: { video: VideoItem; path: string }) {
  const { editing } = useEdit();
  const a = useEditAttrs();
  const hasSource = video.kind === "upload" ? Boolean(video.url) : Boolean(video.embed);
  if (!hasSource && !editing) return null;
  const frame = EMBED_FRAME[video.kind];
  // Regular YouTube videos are widescreen: show the real 16:9 player centred on black rather than
  // letting YouTube crop its cover image to the tall card. Shorts are vertical and fill the card.
  const widescreen = video.kind === "youtube" && !/\/shorts\//i.test(video.url);

  return (
    <div className="lp-reel" {...a.item(path)}>
      {!hasSource ? (
        <div className="lp-reel-empty">Click to add a {VIDEO_KIND_LABELS[video.kind]} link or upload a video</div>
      ) : video.kind === "upload" ? (
        <video
          src={video.url}
          poster={video.poster || undefined}
          title={video.title}
          controls
          playsInline
          preload={video.autoplay ? "auto" : "metadata"}
          {...(video.autoplay ? { autoPlay: true, muted: true, loop: true } : {})}
        />
      ) : widescreen ? (
        <div className="lp-reel-box lp-reel-wide">
          <iframe title={video.title} src={video.embed} {...IFRAME_PROPS} />
        </div>
      ) : frame ? (
        <ScaledEmbed src={video.embed} title={video.title} width={frame.w} height={frame.h} />
      ) : (
        <iframe title={video.title} src={video.embed} {...IFRAME_PROPS} />
      )}
      {editing && <button type="button" className="lp-edit-catch" data-edit-path={path} data-edit-kind="video" aria-label="Edit this video" />}
    </div>
  );
}

/**
 * Draws a fixed-layout embed (Facebook, Instagram) at its natural size and scales the whole thing
 * to fit the card, centred, so it is never cropped or zoomed in.
 */
function ScaledEmbed({ src, title, width, height: defaultHeight }: { src: string; title: string; width: number; height: number }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [fit, setFit] = useState<{ scale: number; x: number; y: number } | null>(null);
  const [height, setHeight] = useState(defaultHeight);

  // Instagram reports the real height of each post (it varies a little); use it when it arrives
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      let data: unknown = e.data;
      if (typeof data === "string") {
        try {
          data = JSON.parse(data);
        } catch {
          return;
        }
      }
      const d = data as { type?: string; details?: { height?: unknown } };
      const h = d?.type === "MEASURE" ? Number(d.details?.height) : NaN;
      if (Number.isFinite(h) && h > 200 && h < 2000) setHeight(Math.ceil(h));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      const { clientWidth: cw, clientHeight: ch } = box;
      if (!cw || !ch) return;
      const scale = Math.min(cw / width, ch / height);
      setFit({ scale, x: (cw - width * scale) / 2, y: (ch - height * scale) / 2 });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    return () => ro.disconnect();
  }, [width, height]);

  return (
    <div ref={boxRef} className="lp-reel-box">
      <iframe
        ref={frameRef}
        title={title}
        src={src}
        width={width}
        height={height}
        scrolling="no"
        {...IFRAME_PROPS}
        style={{
          width,
          height,
          transformOrigin: "0 0",
          transform: fit ? `translate(${fit.x}px, ${fit.y}px) scale(${fit.scale})` : undefined,
          visibility: fit ? "visible" : "hidden",
        }}
      />
    </div>
  );
}
