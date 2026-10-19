"use client";

import { useRef, useState } from "react";
import { VIDEO_KIND_LABELS } from "@/lib/content/embeds";
import { getPath } from "@/lib/content/paths";
import type { VideoItem, VideoKind } from "@/lib/content/types";
import { Field, TextField, useEditor } from "./fields";
import { api, canCompressVideo, formatBytes, uploadVideo, VIDEO_PRESETS, type VideoPreset, type VideoProgress } from "./media";

const KINDS: VideoKind[] = ["tiktok", "instagram", "facebook", "youtube", "upload"];

const PLACEHOLDERS: Record<Exclude<VideoKind, "upload">, string> = {
  tiktok: "https://www.tiktok.com/@account/video/123…",
  instagram: "https://www.instagram.com/reel/AbC123…",
  facebook: "https://www.facebook.com/reel/123… or …/videos/123…",
  youtube: "https://youtube.com/shorts/AbC123…",
};

const STAGE_LABEL: Record<VideoProgress["stage"], string> = {
  prepare: "Reading the video…",
  compress: "Optimizing (this happens on your device)…",
  upload: "Uploading…",
  finish: "Finishing…",
};

export function VideoEditor({ path }: { path: string }) {
  const { content, update, pickMedia, toast } = useEditor();
  const video = getPath<VideoItem>(content, path);
  const [tab, setTab] = useState<VideoKind>(video.kind);
  const [link, setLink] = useState(video.kind !== "upload" ? video.url : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preset, setPreset] = useState<VideoPreset>("balanced");
  const [progress, setProgress] = useState<VideoProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const applyLink = async () => {
    setError("");
    setBusy(true);
    try {
      const parsed = await api<{ kind: VideoKind; url: string; embed: string }>("/api/admin/embed", { method: "POST", json: { url: link } });
      update(path, { ...video, kind: parsed.kind, url: parsed.url, embed: parsed.embed, poster: "", autoplay: false });
      setTab(parsed.kind);
      setLink(parsed.url);
      toast(`${VIDEO_KIND_LABELS[parsed.kind]} video added`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onFile = async (file: File) => {
    setError("");
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const item = await uploadVideo(file, preset, setProgress, ctrl.signal);
      update(path, { ...video, kind: "upload", url: item.url, embed: "", poster: item.poster ?? "" });
      const saved = file.size - item.size;
      toast(saved > 0 ? `Video uploaded — ${formatBytes(file.size)} → ${formatBytes(item.size)}` : "Video uploaded");
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
      setProgress(null);
      abortRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="ed-group">
      <div className="ed-group-title">Video</div>
      <div className="ed-tabs" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            className={tab === k ? "on" : undefined}
            onClick={() => {
              setTab(k);
              setLink(k === video.kind ? video.url : "");
              setError("");
            }}
            disabled={busy}
          >
            {k === "upload" ? "Upload" : VIDEO_KIND_LABELS[k]}
          </button>
        ))}
      </div>

      {tab !== "upload" ? (
        <>
          <Field label={`${VIDEO_KIND_LABELS[tab]} link`} hint="Open the video, tap Share → Copy link, and paste it here.">
            <div className="ed-row">
              <input className="ed-input" value={link} placeholder={PLACEHOLDERS[tab]} onChange={(e) => setLink(e.target.value)} onKeyDown={(e) => e.key === "Enter" && applyLink()} />
              <button type="button" className="ed-btn ed-btn-primary" disabled={busy || !link.trim()} onClick={applyLink}>
                {busy ? "Checking…" : "Use link"}
              </button>
            </div>
          </Field>
          {video.kind === tab && video.embed && <p className="ed-hint">Showing: {video.url}</p>}
        </>
      ) : (
        <>
          {video.kind === "upload" && video.url && (
            <div className="ed-video-preview">
              <video src={video.url} poster={video.poster || undefined} controls playsInline preload="metadata" />
            </div>
          )}
          {progress ? (
            <div className="ed-progress">
              <div className="ed-progress-label">
                {STAGE_LABEL[progress.stage]} {progress.stage !== "prepare" && `${Math.round(progress.progress * 100)}%`}
              </div>
              <div className="ed-progress-bar">
                <span style={{ width: `${progress.progress * 100}%` }} />
              </div>
              {progress.note && <p className="ed-hint">{progress.note}</p>}
              <button type="button" className="ed-btn ed-btn-quiet" onClick={() => abortRef.current?.abort()}>
                Cancel
              </button>
            </div>
          ) : (
            <>
              <Field label="Quality" hint={VIDEO_PRESETS[preset].hint}>
                <select className="ed-input" value={preset} onChange={(e) => setPreset(e.target.value as VideoPreset)}>
                  {(Object.keys(VIDEO_PRESETS) as VideoPreset[]).map((p) => (
                    <option key={p} value={p}>
                      {VIDEO_PRESETS[p].label}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="ed-row">
                <button type="button" className="ed-btn ed-btn-primary" disabled={busy} onClick={() => fileRef.current?.click()}>
                  {video.kind === "upload" && video.url ? "Upload a different video" : "Upload a video"}
                </button>
                <button
                  type="button"
                  className="ed-btn"
                  disabled={busy}
                  onClick={() => pickMedia("video", (m) => update(path, { ...video, kind: "upload", url: m.url, embed: "", poster: m.poster ?? "" }))}
                >
                  From library
                </button>
              </div>
              <input ref={fileRef} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
              {!canCompressVideo() && <p className="ed-hint">This browser can&apos;t optimize video. Chrome, Edge or Safari will make much smaller files.</p>}
            </>
          )}
          {video.kind === "upload" && video.url && !progress && (
            <>
              <div className="ed-field ed-toggle-row">
                <span className="ed-label">Play silently on a loop (like a reel)</span>
                <button type="button" role="switch" aria-checked={video.autoplay} className={`ed-switch${video.autoplay ? " on" : ""}`} onClick={() => update(`${path}.autoplay`, !video.autoplay)}>
                  <span />
                </button>
              </div>
              <Field label="Cover image" hint="Shown before the video plays. Taken from the video automatically.">
                <div className="ed-row">
                  {video.poster && <img className="ed-poster" src={video.poster} alt="" />}
                  <button type="button" className="ed-btn" onClick={() => pickMedia("image", (m) => update(`${path}.poster`, m.url))}>
                    Change cover
                  </button>
                </div>
              </Field>
            </>
          )}
        </>
      )}
      {error && <p className="ed-error">{error}</p>}
      <TextField path={`${path}.title`} />
    </div>
  );
}
