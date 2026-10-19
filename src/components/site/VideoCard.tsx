"use client";

import type { VideoItem } from "@/lib/content/types";
import { VIDEO_KIND_LABELS } from "@/lib/content/embeds";
import { useEdit, useEditAttrs } from "./edit";

export function VideoCard({ video, path }: { video: VideoItem; path: string }) {
  const { editing } = useEdit();
  const a = useEditAttrs();
  const hasSource = video.kind === "upload" ? Boolean(video.url) : Boolean(video.embed);
  if (!hasSource && !editing) return null;

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
      ) : (
        <iframe
          title={video.title}
          src={video.embed}
          loading="lazy"
          allow="fullscreen; encrypted-media; picture-in-picture"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      )}
      {editing && <button type="button" className="lp-edit-catch" data-edit-path={path} data-edit-kind="video" aria-label="Edit this video" />}
    </div>
  );
}
