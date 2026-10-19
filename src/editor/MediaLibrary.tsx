"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, formatBytes, uploadImage, uploadVideo, type MediaItem, type VideoProgress } from "./media";
import { useEditor } from "./fields";

type Props = {
  type?: "image" | "video";
  onPick?: (item: MediaItem) => void;
  onClose?: () => void;
  inline?: boolean;
};

export function MediaLibrary({ type, onPick, onClose, inline }: Props) {
  const { content, toast } = useEditor();
  const [items, setItems] = useState<MediaItem[] | null>(null);
  const [filter, setFilter] = useState<"all" | "image" | "video">(type ?? "all");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await api<{ items: MediaItem[] }>("/api/admin/media");
      setItems(data.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  const onFiles = async (files: FileList) => {
    setError("");
    for (const file of Array.from(files)) {
      try {
        if (file.type.startsWith("video/")) {
          setBusy(`Optimizing ${file.name}…`);
          const ctrl = new AbortController();
          const item = await uploadVideo(file, "balanced", (p: VideoProgress) => setBusy(`${file.name}: ${p.stage} ${Math.round(p.progress * 100)}%`), ctrl.signal);
          setItems((prev) => [item, ...(prev ?? [])]);
          toast(`Uploaded ${file.name} (${formatBytes(file.size)} → ${formatBytes(item.size)})`);
        } else {
          setBusy(`Uploading ${file.name}…`);
          const item = await uploadImage(file);
          setItems((prev) => [item, ...(prev ?? [])]);
          toast(`Uploaded ${file.name}`);
        }
      } catch (e) {
        setError(`${file.name}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    setBusy(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const remove = async (item: MediaItem) => {
    const used = JSON.stringify(content).includes(item.url);
    if (!window.confirm(used ? "This file is used on the site. Delete it anyway? It will disappear from the page once you publish." : "Delete this file permanently?")) return;
    try {
      await api(`/api/admin/media/${item.id}`, { method: "DELETE" });
      setItems((prev) => prev?.filter((i) => i.id !== item.id) ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const shown = items?.filter((i) => filter === "all" || i.type === filter) ?? [];
  const accept = type === "image" ? "image/*" : type === "video" ? "video/*" : "image/*,video/*";

  const body = (
    <div className="ed-library">
      <div className="ed-library-bar">
        {!type && (
          <div className="ed-tabs">
            {(["all", "image", "video"] as const).map((f) => (
              <button key={f} type="button" className={filter === f ? "on" : undefined} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "image" ? "Images" : "Videos"}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="ed-btn ed-btn-primary" disabled={!!busy} onClick={() => fileRef.current?.click()}>
          Upload {type === "video" ? "video" : type === "image" ? "image" : "files"}
        </button>
        <input ref={fileRef} type="file" accept={accept} multiple={type !== "video"} hidden onChange={(e) => e.target.files && onFiles(e.target.files)} />
      </div>
      {busy && <p className="ed-hint">{busy}</p>}
      {error && <p className="ed-error">{error}</p>}
      {items === null ? (
        <p className="ed-hint">Loading…</p>
      ) : shown.length === 0 ? (
        <p className="ed-empty">Nothing here yet. Upload {type ?? "a file"} to get started.</p>
      ) : (
        <div className="ed-library-grid">
          {shown.map((item) => (
            <div key={item.id} className="ed-library-item">
              <button type="button" className="ed-library-thumb" disabled={!onPick} onClick={() => onPick?.(item)} title={onPick ? "Use this" : item.name}>
                {item.type === "image" ? <img src={item.url} alt="" loading="lazy" /> : item.poster ? <img src={item.poster} alt="" loading="lazy" /> : <span>▶ video</span>}
                {item.type === "video" && <span className="ed-badge">▶ {item.duration ? `${Math.round(item.duration)}s` : "video"}</span>}
              </button>
              <div className="ed-library-meta">
                <span title={item.name}>{item.name}</span>
                <span>
                  {formatBytes(item.size)}
                  {item.originalSize && item.originalSize > item.size * 1.1 ? ` (was ${formatBytes(item.originalSize)})` : ""}
                </span>
              </div>
              <button type="button" className="ed-library-del" title="Delete" onClick={() => remove(item)}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  if (inline) return body;
  return (
    <div className="ed-modal" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ed-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="ed-modal-head">
          <h2>{type === "video" ? "Choose a video" : type === "image" ? "Choose an image" : "Media library"}</h2>
          <button type="button" className="ed-icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {body}
      </div>
    </div>
  );
}
