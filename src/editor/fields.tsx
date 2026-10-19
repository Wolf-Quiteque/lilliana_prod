"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getPath, patternOf } from "@/lib/content/paths";
import { isRich } from "@/lib/content/schema";
import type { LinkItem, Media, VideoItem } from "@/lib/content/types";
import { cleanRichHtml } from "@/lib/content/rich-client";
import type { SiteContent } from "@/lib/content/types";
import { ANCHORS, fieldHint, fieldLabel, itemTitle } from "./labels";
import type { ListOp } from "./protocol";
import { VideoEditor } from "./VideoEditor";
import type { MediaItem } from "./media";

export type EditorApi = {
  content: SiteContent;
  update: (path: string, value: unknown, coalesce?: string) => void;
  listOp: (op: ListOp, path: string) => void;
  addItem: (listPath: string) => void;
  pickMedia: (type: "image" | "video", onPick: (item: MediaItem) => void) => void;
  focus: (path: string) => void;
  toast: (msg: string, kind?: "ok" | "error") => void;
};

export const EditorContext = createContext<EditorApi | null>(null);
export function useEditor() {
  const c = useContext(EditorContext);
  if (!c) throw new Error("useEditor outside EditorContext");
  return c;
}

const HIDDEN_KEYS = new Set(["id", "embed", "version"]);
const LONG_KEYS = new Set(["body", "intro", "text", "seoDescription", "note", "sentNote", "placeholder", "messagePlaceholder"]);
const ENUM_OPTIONS: Record<string, [string, string][]> = {
  "settings.theme": [
    ["auto", "Follow the visitor's device"],
    ["dark", "Dark"],
    ["light", "Light"],
  ],
  "footer.socials.*.platform": [
    ["facebook", "Facebook"],
    ["instagram", "Instagram"],
    ["tiktok", "TikTok"],
    ["youtube", "YouTube"],
    ["linkedin", "LinkedIn"],
    ["x", "X (Twitter)"],
  ],
};

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
export const isMedia = (v: unknown): v is Media => isObj(v) && "url" in v && "alt" in v && "focus" in v;
export const isVideo = (v: unknown): v is VideoItem => isObj(v) && "kind" in v && "embed" in v;
export const isLink = (v: unknown): v is LinkItem => isObj(v) && "label" in v && "href" in v && "id" in v && Object.keys(v).length === 3;

/** Renders the right editor for whatever lives at `path` */
export function AutoForm({ path, depth = 0, skip }: { path: string; depth?: number; skip?: string[] }) {
  const { content } = useEditor();
  const value = getPath(content, path);
  const key = path.split(".").pop() ?? "";
  if (HIDDEN_KEYS.has(key) || skip?.includes(key)) return null;

  if (Array.isArray(value)) return <ListField path={path} />;
  if (isVideo(value)) return <VideoEditor path={path} />;
  if (isMedia(value)) return <MediaField path={path} />;
  if (isLink(value)) return <LinkField path={path} />;
  if (isObj(value)) {
    return (
      <div className={depth > 0 ? "ed-group" : undefined}>
        {Object.keys(value).map((k) => (
          <AutoForm key={k} path={path ? `${path}.${k}` : k} depth={depth + 1} skip={skip} />
        ))}
      </div>
    );
  }
  if (typeof value === "boolean") return <ToggleField path={path} />;
  if (typeof value === "string") {
    const pattern = patternOf(path);
    if (ENUM_OPTIONS[pattern]) return <SelectField path={path} options={ENUM_OPTIONS[pattern]} />;
    if (key === "accent") return <ColorField path={path} />;
    if (key === "href") return <HrefField path={path} />;
    if (key === "ogImage") return <ImageUrlField path={path} />;
    if (isRich(path)) return <RichField path={path} />;
    return <TextField path={path} multiline={LONG_KEYS.has(key) || value.length > 70} />;
  }
  return null;
}

export function Field({ path, label, children, hint }: { path?: string; label?: string; children: ReactNode; hint?: string }) {
  const text = label ?? (path ? fieldLabel(path) : "");
  const help = hint ?? (path ? fieldHint(path) : undefined);
  return (
    <label className="ed-field">
      {text && <span className="ed-label">{text}</span>}
      {children}
      {help && <span className="ed-hint">{help}</span>}
    </label>
  );
}

export function TextField({ path, multiline }: { path: string; multiline?: boolean }) {
  const { content, update } = useEditor();
  const value = getPath<string>(content, path) ?? "";
  return (
    <Field path={path}>
      {multiline ? (
        <textarea className="ed-input" rows={Math.min(8, Math.max(3, Math.ceil(value.length / 48)))} value={value} onChange={(e) => update(path, e.target.value, path)} />
      ) : (
        <input className="ed-input" value={value} onChange={(e) => update(path, e.target.value, path)} />
      )}
    </Field>
  );
}

function SelectField({ path, options }: { path: string; options: [string, string][] }) {
  const { content, update } = useEditor();
  return (
    <Field path={path}>
      <select className="ed-input" value={getPath<string>(content, path)} onChange={(e) => update(path, e.target.value)}>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Field>
  );
}

function ToggleField({ path }: { path: string }) {
  const { content, update } = useEditor();
  const on = getPath<boolean>(content, path);
  return (
    <div className="ed-field ed-toggle-row">
      <span className="ed-label">{fieldLabel(path)}</span>
      <button type="button" role="switch" aria-checked={on} className={`ed-switch${on ? " on" : ""}`} onClick={() => update(path, !on)}>
        <span />
      </button>
      {fieldHint(path) && <span className="ed-hint">{fieldHint(path)}</span>}
    </div>
  );
}

const SWATCHES = ["#e13b82", "#b3123f", "#d9467a", "#7c3aed", "#1f6feb", "#0f766e", "#c2410c", "#171316"];

function ColorField({ path }: { path: string }) {
  const { content, update } = useEditor();
  const value = getPath<string>(content, path);
  return (
    <Field path={path}>
      <div className="ed-swatches">
        {SWATCHES.map((c) => (
          <button key={c} type="button" title={c} className={`ed-swatch${c === value ? " on" : ""}`} style={{ background: c }} onClick={() => update(path, c)} />
        ))}
        <input type="color" value={value} onChange={(e) => update(path, e.target.value, path)} title="Custom colour" />
      </div>
    </Field>
  );
}

export function HrefField({ path, label }: { path: string; label?: string }) {
  const { content, update } = useEditor();
  const value = getPath<string>(content, path) ?? "";
  const anchor = ANCHORS.find((a) => a.href === value);
  return (
    <Field path={path} label={label}>
      <div className="ed-row">
        <select className="ed-input ed-shrink" value={anchor ? value : ""} onChange={(e) => e.target.value && update(path, e.target.value)}>
          <option value="">Web address…</option>
          {ANCHORS.map((a) => (
            <option key={a.href} value={a.href}>
              ↳ {a.label}
            </option>
          ))}
        </select>
        <input className="ed-input" value={value} placeholder="https://… or tel:… or mailto:…" onChange={(e) => update(path, e.target.value, path)} />
      </div>
    </Field>
  );
}

function LinkField({ path }: { path: string }) {
  return (
    <div className="ed-group">
      <div className="ed-group-title">{fieldLabel(path)}</div>
      <TextField path={`${path}.label`} />
      <HrefField path={`${path}.href`} label="Goes to" />
    </div>
  );
}

/** Rich text: same formatting as on the page (accent highlight, bold, links, line breaks) */
export function RichField({ path }: { path: string }) {
  const { content, update } = useEditor();
  const value = getPath<string>(content, path) ?? "";
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el && document.activeElement !== el && el.innerHTML !== value) el.innerHTML = value;
  }, [value]);
  const cmd = (c: string, v?: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    ref.current?.focus();
    document.execCommand(c, false, v);
  };
  return (
    <Field path={path}>
      <div className="ed-rich">
        <div className="ed-rich-bar">
          <button type="button" onMouseDown={cmd("italic")}>
            <span style={{ color: "var(--ed-accent)", fontWeight: 700 }}>Accent</span>
          </button>
          <button type="button" onMouseDown={cmd("bold")}>
            <b>B</b>
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              const url = window.prompt("Link address", "https://");
              if (url) {
                ref.current?.focus();
                document.execCommand("createLink", false, url);
              }
            }}
          >
            Link
          </button>
          <button
            type="button"
            onMouseDown={(e) => {
              cmd("removeFormat")(e);
              document.execCommand("unlink");
            }}
          >
            Clear
          </button>
        </div>
        <div
          ref={ref}
          className="ed-rich-area"
          contentEditable
          suppressContentEditableWarning
          onInput={() => update(path, cleanRichHtml(ref.current!.innerHTML), path)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              document.execCommand("insertLineBreak");
            }
          }}
          onPaste={(e) => {
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
          }}
        />
      </div>
    </Field>
  );
}

const FOCUS_POINTS = ["0% 0%", "50% 0%", "100% 0%", "0% 50%", "50% 50%", "100% 50%", "0% 100%", "50% 100%", "100% 100%"];

export function MediaField({ path }: { path: string }) {
  const { content, update, pickMedia } = useEditor();
  const media = getPath<Media>(content, path);
  return (
    <div className="ed-group">
      <div className="ed-group-title">{fieldLabel(path)}</div>
      {fieldHint(path) && <span className="ed-hint">{fieldHint(path)}</span>}
      <div className="ed-media">
        <div className="ed-media-thumb">
          {media.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" style={{ objectPosition: media.focus }} />
          ) : (
            <span>No image</span>
          )}
        </div>
        <div className="ed-media-actions">
          <button type="button" className="ed-btn" onClick={() => pickMedia("image", (m) => update(path, { ...media, url: m.url }))}>
            {media.url ? "Replace image" : "Add image"}
          </button>
          {media.url && (
            <button type="button" className="ed-btn ed-btn-quiet" onClick={() => update(path, { ...media, url: "" })}>
              Remove
            </button>
          )}
        </div>
      </div>
      {media.url && (
        <>
          <TextField path={`${path}.alt`} />
          <Field label="Keep this part in view when cropped">
            <div className="ed-focus">
              {FOCUS_POINTS.map((f) => (
                <button key={f} type="button" title={f} className={f === media.focus ? "on" : undefined} onClick={() => update(`${path}.focus`, f)} />
              ))}
            </div>
          </Field>
        </>
      )}
    </div>
  );
}

function ImageUrlField({ path }: { path: string }) {
  const { content, update, pickMedia } = useEditor();
  const url = getPath<string>(content, path);
  return (
    <Field path={path} hint="Shown on Facebook, WhatsApp, iMessage… 1200 × 630 works best.">
      <div className="ed-media">
        <div className="ed-media-thumb">{url ? <img src={url} alt="" /> : <span>None</span>}</div>
        <div className="ed-media-actions">
          <button type="button" className="ed-btn" onClick={() => pickMedia("image", (m) => update(path, m.url))}>
            {url ? "Replace" : "Choose image"}
          </button>
          {url && (
            <button type="button" className="ed-btn ed-btn-quiet" onClick={() => update(path, "")}>
              Remove
            </button>
          )}
        </div>
      </div>
    </Field>
  );
}

/** Any list: collapsible items with reorder / duplicate / delete, plus an Add button */
export function ListField({ path }: { path: string }) {
  const { content, listOp, addItem } = useEditor();
  const list = getPath<unknown[]>(content, path) ?? [];
  const [open, setOpen] = useState<string | null>(null);
  const simple = list.length > 0 && list.every((it) => isObj(it) && Object.keys(it).length === 2 && "text" in it);

  return (
    <div className="ed-group">
      <div className="ed-group-title">
        {fieldLabel(path)} <span className="ed-count">{list.length}</span>
      </div>
      {fieldHint(path) && <span className="ed-hint">{fieldHint(path)}</span>}
      <div className="ed-list">
        {list.map((item, i) => {
          const itemPath = `${path}.${i}`;
          const id = isObj(item) && typeof item.id === "string" ? item.id : String(i);
          const isOpen = open === id;
          return (
            <div key={id} className={`ed-list-item${isOpen ? " open" : ""}`}>
              <div className="ed-list-head">
                {simple ? (
                  <SimpleText path={`${itemPath}.text`} />
                ) : (
                  <button type="button" className="ed-list-title" onClick={() => setOpen(isOpen ? null : id)}>
                    <span className="ed-caret">{isOpen ? "▾" : "▸"}</span> {itemTitle(item, i)}
                  </button>
                )}
                <div className="ed-list-tools">
                  <button type="button" title="Move up" disabled={i === 0} onClick={() => listOp("up", itemPath)}>
                    ↑
                  </button>
                  <button type="button" title="Move down" disabled={i === list.length - 1} onClick={() => listOp("down", itemPath)}>
                    ↓
                  </button>
                  <button type="button" title="Duplicate" onClick={() => listOp("dup", itemPath)}>
                    ⧉
                  </button>
                  <button type="button" title="Delete" className="danger" onClick={() => listOp("del", itemPath)}>
                    ✕
                  </button>
                </div>
              </div>
              {isOpen && !simple && (
                <div className="ed-list-body">
                  <AutoForm path={itemPath} depth={1} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button type="button" className="ed-btn ed-btn-add" onClick={() => addItem(path)}>
        + Add
      </button>
    </div>
  );
}

function SimpleText({ path }: { path: string }) {
  const { content, update } = useEditor();
  return <input className="ed-input ed-inline" value={getPath<string>(content, path) ?? ""} onChange={(e) => update(path, e.target.value, path)} />;
}
