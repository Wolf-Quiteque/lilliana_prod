"use client";

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { SelectKind } from "@/components/site/edit";
import { getPath, newId, parentPath, patternOf, setPath } from "@/lib/content/paths";
import { isRich, LIST_TEMPLATES } from "@/lib/content/schema";
import { SECTION_LABELS, type SectionId, type SiteContent } from "@/lib/content/types";
import { AutoForm, EditorContext, isLink, isMedia, isVideo, RichField, TextField, type EditorApi } from "./fields";
import { fieldLabel, groupLabel, itemTitle, SETTINGS_GROUPS, SITE_GROUPS } from "./labels";
import { MediaLibrary } from "./MediaLibrary";
import { api, type MediaItem } from "./media";
import { isSameOrigin, type FromCanvas, type ListOp, type ToCanvas } from "./protocol";
import { AccountPanel, VersionsPanel } from "./panels";

type Selection = { path: string; kind: SelectKind } | null;
type Panel = "page" | "settings" | "media" | "versions" | "account";
type Device = "desktop" | "tablet" | "mobile";
type SaveState = "saved" | "saving" | "unsaved" | "error";
type Toast = { id: number; msg: string; kind: "ok" | "error" };

const DEVICE_WIDTH: Record<Device, number> = { desktop: 1280, tablet: 834, mobile: 390 };

function reId<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reId) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = k === "id" && typeof v === "string" ? newId(v.replace(/[^a-z]/gi, "").slice(0, 2) || "i") : reId(v);
    return out as T;
  }
  return value;
}

export function EditorApp({ initial, hasUnpublished: initialUnpublished, email }: { initial: SiteContent; hasUnpublished: boolean; email: string }) {
  const [content, setContent] = useState(initial);
  const contentRef = useRef(initial);
  const past = useRef<SiteContent[]>([]);
  const future = useRef<SiteContent[]>([]);
  const coalesceRef = useRef<{ key: string; at: number } | null>(null);
  const [, setHistoryTick] = useState(0);

  const [selection, setSelection] = useState<Selection>(null);
  const [panel, setPanel] = useState<Panel>("page");
  const [device, setDevice] = useState<Device>("desktop");
  const [preview, setPreview] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [unpublished, setUnpublished] = useState(initialUnpublished);
  const [publishing, setPublishing] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [picker, setPicker] = useState<{ type: "image" | "video"; onPick: (m: MediaItem) => void } | null>(null);
  const [mobilePane, setMobilePane] = useState<"none" | "left" | "right">("none");

  const frameRef = useRef<HTMLIFrameElement>(null);
  const canvasReady = useRef(false);
  const canvasRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toast = useCallback((msg: string, kind: "ok" | "error" = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "error" ? 7000 : 3800);
  }, []);

  /* ---------------------------------------------------------- saving */

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saving = useRef<Promise<void> | null>(null);
  const savedRef = useRef(initial);

  const save = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
    if (saving.current) await saving.current;
    const snapshot = contentRef.current;
    if (snapshot === savedRef.current) return;
    setSaveState("saving");
    const run = (async () => {
      try {
        await api("/api/admin/content", { method: "PUT", json: { content: snapshot } });
        savedRef.current = snapshot;
        setUnpublished(true);
        setSaveState(contentRef.current === snapshot ? "saved" : "unsaved");
      } catch (e) {
        setSaveState("error");
        toast(`Couldn't save: ${e instanceof Error ? e.message : e}`, "error");
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
    if (contentRef.current !== savedRef.current && !saveTimer.current) saveTimer.current = setTimeout(save, 1200);
  }, [toast]);

  const scheduleSave = useCallback(() => {
    setSaveState((s) => (s === "saving" ? s : "unsaved"));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(save, 1200);
  }, [save]);

  /* --------------------------------------------------------- history */

  const commit = useCallback(
    (next: SiteContent, coalesce?: string) => {
      const prev = contentRef.current;
      if (next === prev) return;
      const now = Date.now();
      const c = coalesceRef.current;
      if (!(coalesce && c && c.key === coalesce && now - c.at < 1500)) {
        past.current.push(prev);
        if (past.current.length > 200) past.current.shift();
      }
      coalesceRef.current = coalesce ? { key: coalesce, at: now } : null;
      future.current = [];
      contentRef.current = next;
      setContent(next);
      setHistoryTick((n) => n + 1);
      scheduleSave();
    },
    [scheduleSave],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(contentRef.current);
    coalesceRef.current = null;
    contentRef.current = prev;
    setContent(prev);
    setHistoryTick((n) => n + 1);
    scheduleSave();
  }, [scheduleSave]);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(contentRef.current);
    coalesceRef.current = null;
    contentRef.current = next;
    setContent(next);
    setHistoryTick((n) => n + 1);
    scheduleSave();
  }, [scheduleSave]);

  const update = useCallback((path: string, value: unknown, coalesce?: string) => commit(setPath(contentRef.current, path, value), coalesce), [commit]);

  /* ------------------------------------------------------- list ops */

  const listOp = useCallback(
    (op: ListOp, path: string) => {
      const pp = parentPath(path);
      if (!pp) return;
      const list = getPath<unknown[]>(contentRef.current, pp.list);
      if (!Array.isArray(list)) return;
      const i = pp.index;
      const next = [...list];
      let sel: string | null = path;
      if (op === "up") {
        if (i === 0) return;
        [next[i - 1], next[i]] = [next[i], next[i - 1]];
        sel = `${pp.list}.${i - 1}`;
      } else if (op === "down") {
        if (i >= list.length - 1) return;
        [next[i + 1], next[i]] = [next[i], next[i + 1]];
        sel = `${pp.list}.${i + 1}`;
      } else if (op === "dup") {
        next.splice(i + 1, 0, reId(structuredClone(list[i])));
        sel = `${pp.list}.${i + 1}`;
      } else if (op === "add") {
        const tpl = LIST_TEMPLATES[patternOf(pp.list)];
        if (!tpl) return;
        next.splice(i + 1, 0, tpl());
        sel = `${pp.list}.${i + 1}`;
      } else if (op === "del") {
        next.splice(i, 1);
        sel = null;
        toast(`Deleted “${itemTitle(list[i], i)}”. Press Undo to bring it back.`);
      }
      commit(setPath(contentRef.current, pp.list, next));
      setSelection(sel ? { path: sel, kind: "item" } : { path: pp.list.split(".")[0], kind: "section" });
    },
    [commit, toast],
  );

  const addItem = useCallback(
    (listPath: string) => {
      const tpl = LIST_TEMPLATES[patternOf(listPath)];
      const list = getPath<unknown[]>(contentRef.current, listPath) ?? [];
      if (!tpl) return;
      commit(setPath(contentRef.current, listPath, [...list, tpl()]));
      setSelection({ path: `${listPath}.${list.length}`, kind: "item" });
    },
    [commit],
  );

  /* --------------------------------------------------------- canvas */

  const sendToCanvas = useCallback((m: ToCanvas) => {
    if (canvasReady.current) frameRef.current?.contentWindow?.postMessage(m, window.location.origin);
  }, []);

  const scrollTo = useCallback((target: string) => sendToCanvas({ type: "scrollTo", target }), [sendToCanvas]);

  useEffect(() => {
    sendToCanvas({ type: "content", content, selected: selection?.path ?? null, preview });
  }, [content, selection, preview, sendToCanvas]);

  const handlersRef = useRef({ update, listOp, undo, redo, save });
  handlersRef.current = { update, listOp, undo, redo, save };

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!isSameOrigin(e) || e.source !== frameRef.current?.contentWindow) return;
      const m = e.data as FromCanvas;
      const h = handlersRef.current;
      if (m.type === "ready") {
        canvasReady.current = true;
        frameRef.current?.contentWindow?.postMessage({ type: "content", content: contentRef.current, selected: null, preview: false } satisfies ToCanvas, window.location.origin);
      } else if (m.type === "change") h.update(m.path, m.value, m.path);
      else if (m.type === "select") {
        setSelection({ path: m.path, kind: m.kind });
        setMobilePane((p) => (p === "none" ? p : "right"));
      } else if (m.type === "list") h.listOp(m.op, m.path);
      else if (m.type === "key") {
        if (m.key === "undo") h.undo();
        else if (m.key === "redo") h.redo();
        else h.save();
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Shortcuts while the focus is in the editor panels
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      const inField = (e.target as HTMLElement).closest("input, textarea, [contenteditable]");
      if ((k === "z" || k === "y") && !inField) {
        e.preventDefault();
        if ((k === "z" && e.shiftKey) || k === "y") redo();
        else undo();
      } else if (k === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, save]);

  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (contentRef.current !== savedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  /* --------------------------------------------------------- publish */

  const publish = async () => {
    setPublishing(true);
    try {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (saving.current) await saving.current;
      const snapshot = contentRef.current;
      await api("/api/admin/publish", { method: "POST", json: { content: snapshot } });
      savedRef.current = snapshot;
      setSaveState(contentRef.current === snapshot ? "saved" : "unsaved");
      setUnpublished(false);
      toast("Published! Your changes are live.");
    } catch (e) {
      toast(`Couldn't publish: ${e instanceof Error ? e.message : e}`, "error");
    } finally {
      setPublishing(false);
    }
  };

  const replaceAll = useCallback(
    (next: SiteContent, msg: string) => {
      commit(next);
      setSelection(null);
      toast(msg);
    },
    [commit, toast],
  );

  const editorApi: EditorApi = useMemo(
    () => ({
      content,
      update,
      listOp,
      addItem,
      pickMedia: (type, onPick) =>
        setPicker({
          type,
          onPick: (m) => {
            onPick(m);
            setPicker(null);
          },
        }),
      focus: scrollTo,
      toast,
    }),
    [content, update, listOp, addItem, scrollTo, toast],
  );

  const openGroup = (id: string) => {
    setSelection({ path: id, kind: "section" });
    if (SITE_GROUPS.some((g) => g.id === id)) scrollTo(id);
    setMobilePane("right");
  };

  const statusText = { saved: unpublished ? "Draft saved" : "All changes are live", saving: "Saving…", unsaved: "Unsaved changes", error: "Not saved — retrying" }[saveState];

  return (
    <EditorContext.Provider value={editorApi}>
      <div className={`ed-app ed-pane-${mobilePane}`}>
        <header className="ed-top">
          <div className="ed-brand">
            <button type="button" className="ed-icon-btn ed-mobile-only" onClick={() => setMobilePane((p) => (p === "left" ? "none" : "left"))} aria-label="Menu">
              ☰
            </button>
            <span className="ed-logo">LP</span>
            <span className="ed-brand-name">Site editor</span>
          </div>
          <div className="ed-devices" role="group" aria-label="Preview size">
            {(["desktop", "tablet", "mobile"] as Device[]).map((d) => (
              <button key={d} type="button" className={device === d ? "on" : undefined} onClick={() => setDevice(d)} title={`${d[0].toUpperCase()}${d.slice(1)} view`}>
                {d === "desktop" ? "🖥" : d === "tablet" ? "▭" : "📱"}
                <span className="ed-hide-sm"> {d[0].toUpperCase() + d.slice(1)}</span>
              </button>
            ))}
          </div>
          <div className="ed-actions">
            <button type="button" className="ed-icon-btn ed-mobile-only" onClick={() => setMobilePane((p) => (p === "right" ? "none" : "right"))} title="Edit options">
              ⚙
            </button>
            <button type="button" className="ed-icon-btn" onClick={undo} disabled={!past.current.length} title="Undo (⌘Z)">
              ↶
            </button>
            <button type="button" className="ed-icon-btn" onClick={redo} disabled={!future.current.length} title="Redo (⇧⌘Z)">
              ↷
            </button>
            <span className={`ed-status ed-status-${saveState}`}>{statusText}</span>
            <button type="button" className={`ed-btn${preview ? " on" : ""}`} onClick={() => setPreview((p) => !p)}>
              {preview ? "Back to editing" : "Preview"}
            </button>
            <a className="ed-btn ed-hide-sm" href="/" target="_blank" rel="noreferrer">
              View live site ↗
            </a>
            <button
              type="button"
              className="ed-account-btn"
              title={`Account — ${email} (change password, sign out)`}
              onClick={() => {
                setPanel("account");
                setMobilePane("left");
              }}
            >
              {email[0]}
            </button>
            <button type="button" className="ed-btn ed-btn-publish" onClick={publish} disabled={publishing || (!unpublished && saveState === "saved")}>
              {publishing ? "Publishing…" : "Publish"}
              {unpublished && !publishing && <span className="ed-dot" />}
            </button>
          </div>
        </header>

        <aside className="ed-left">
          <nav className="ed-left-tabs">
            {(
              [
                ["page", "Page"],
                ["settings", "Settings"],
                ["media", "Media"],
                ["versions", "Versions"],
                ["account", "Account"],
              ] as [Panel, string][]
            ).map(([id, label]) => (
              <button key={id} type="button" className={panel === id ? "on" : undefined} onClick={() => setPanel(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="ed-left-body">
            {panel === "page" && <PagePanel selected={selection?.path.split(".")[0]} onOpen={openGroup} />}
            {panel === "settings" && (
              <div className="ed-stack">
                <p className="ed-hint">Colours, search engine text, your logo and the intro animation.</p>
                {SETTINGS_GROUPS.map((g) => (
                  <button key={g.id} type="button" className={`ed-nav-row${selection?.path.split(".")[0] === g.id ? " on" : ""}`} onClick={() => openGroup(g.id)}>
                    {g.label} <span>›</span>
                  </button>
                ))}
              </div>
            )}
            {panel === "media" && <MediaLibrary inline />}
            {panel === "versions" && <VersionsPanel onRestore={replaceAll} />}
            {panel === "account" && <AccountPanel email={email} />}
          </div>
        </aside>

        <main ref={canvasRef} className="ed-canvas">
          <CanvasFrame frameRef={frameRef} box={box} device={device} />
        </main>

        <aside className="ed-right">
          <button type="button" className="ed-icon-btn ed-mobile-only ed-close-right" onClick={() => setMobilePane("none")} aria-label="Close panel">
            ✕
          </button>
          <Inspector selection={selection} setSelection={setSelection} />
        </aside>

        {picker && <MediaLibrary type={picker.type} onPick={picker.onPick} onClose={() => setPicker(null)} />}

        <div className="ed-toasts" aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} className={`ed-toast ed-toast-${t.kind}`}>
              {t.msg}
              {t.msg.includes("Undo") && (
                <button type="button" onClick={undo}>
                  Undo
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </EditorContext.Provider>
  );
}

/** The preview iframe, laid out at the real device width and scaled down to fit when needed */
function CanvasFrame({ frameRef, box, device }: { frameRef: React.RefObject<HTMLIFrameElement | null>; box: { w: number; h: number }; device: Device }) {
  const target = DEVICE_WIDTH[device];
  const natural = box.w === 0 || box.w < 600 || (device === "desktop" && box.w >= target);
  const frameW = natural ? box.w || target : target;
  const scale = natural ? 1 : Math.min(1, box.w / target);
  const height = box.h || 800;
  return (
    <div className="ed-frame-wrap" style={{ width: frameW * scale, height }}>
      <iframe
        ref={frameRef}
        src="/editor-canvas"
        title="Site preview"
        className="ed-frame"
        style={{ width: frameW, height: height / scale, transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "0 0" }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- page panel */

function PagePanel({ selected, onOpen }: { selected?: string; onOpen: (id: string) => void }) {
  const { content, update } = useEditorContent();
  const order = content.sections.order;
  const hidden = content.sections.hidden;
  const move = (id: SectionId, dir: -1 | 1) => {
    const i = order.indexOf(id);
    const j = i + dir;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    update("sections.order", next);
  };
  const toggle = (id: SectionId) => update("sections.hidden", hidden.includes(id) ? hidden.filter((h) => h !== id) : [...hidden, id]);

  const row = (id: string, label: string, section?: SectionId) => (
    <div key={id} className={`ed-nav-row${selected === id ? " on" : ""}${section && hidden.includes(section) ? " is-hidden" : ""}`}>
      <button type="button" className="ed-nav-main" onClick={() => onOpen(id)}>
        {label}
      </button>
      {section && (
        <span className="ed-nav-tools">
          <button type="button" title="Move up" onClick={() => move(section, -1)} disabled={order.indexOf(section) === 0}>
            ↑
          </button>
          <button type="button" title="Move down" onClick={() => move(section, 1)} disabled={order.indexOf(section) === order.length - 1}>
            ↓
          </button>
          <button type="button" title={hidden.includes(section) ? "Show on the site" : "Hide from the site"} onClick={() => toggle(section)}>
            {hidden.includes(section) ? "Show" : "Hide"}
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className="ed-stack">
      <p className="ed-hint">Click any text on the page to type over it. Click images, videos and cards for more options.</p>
      {row("header", "Header & menu")}
      {order.map((id) => row(id, SECTION_LABELS[id], id))}
      {row("footer", "Footer")}
    </div>
  );
}

function useEditorContent() {
  const ctx = useEditorSafe();
  return { content: ctx.content, update: ctx.update };
}

function useEditorSafe() {
  const c = useContext(EditorContext);
  if (!c) throw new Error("no editor");
  return c;
}

/* --------------------------------------------------------------- inspector */

function Inspector({ selection, setSelection }: { selection: Selection; setSelection: (s: Selection) => void }) {
  const { content, listOp } = useEditorSafe();
  if (!selection) {
    return (
      <div className="ed-inspector ed-empty-state">
        <h3>Edit anything</h3>
        <ul>
          <li>Click text on the page and type.</li>
          <li>Select words in a headline and press <b>Accent</b> to colour them.</li>
          <li>Click a video, image or card to change it here.</li>
          <li>Hover a card for move / duplicate / delete buttons.</li>
          <li>Changes save as a draft automatically. Press <b>Publish</b> when you&apos;re happy.</li>
        </ul>
      </div>
    );
  }

  const keys = selection.path.split(".");
  const group = keys[0];
  const sectionId = (SECTION_LABELS as Record<string, string>)[group] ? (group as SectionId) : null;

  // Find the most useful thing to edit around the selection: a video, image, link or list item
  let target: string | null = null;
  for (let n = keys.length; n >= 2; n--) {
    const sub = keys.slice(0, n).join(".");
    const v = getPath(content, sub);
    if (isVideo(v) || isMedia(v) || isLink(v) || /^\d+$/.test(keys[n - 1])) {
      target = sub;
      break;
    }
  }
  if (!target && selection.kind === "item" && keys.length > 1) target = selection.path;
  const textOnly = !target && (selection.kind === "text" || selection.kind === "rich") ? selection.path : null;
  const listItem = target ? parentPath(target) : null;
  const showAll = selection.kind === "section" || keys.length === 1;

  return (
    <div className="ed-inspector">
      <div className="ed-crumbs">
        <button type="button" onClick={() => setSelection({ path: group, kind: "section" })}>
          {groupLabel(group)}
        </button>
        {target && (
          <>
            <span>›</span>
            <span>{listItem ? itemTitle(getPath(content, target), listItem.index) : fieldLabel(target)}</span>
          </>
        )}
      </div>

      {sectionId && content.sections.hidden.includes(sectionId) && <p className="ed-warning">This section is hidden. Show it from the Page tab.</p>}

      {target && (
        <div className="ed-card">
          {listItem && (
            <div className="ed-card-tools">
              <button type="button" onClick={() => listOp("up", target!)}>
                ↑ Move up
              </button>
              <button type="button" onClick={() => listOp("down", target!)}>
                ↓ Move down
              </button>
              <button type="button" onClick={() => listOp("dup", target!)}>
                Duplicate
              </button>
              <button type="button" className="danger" onClick={() => listOp("del", target!)}>
                Delete
              </button>
            </div>
          )}
          <AutoForm path={target} />
        </div>
      )}

      {textOnly && (
        <div className="ed-card">
          <p className="ed-hint">You&apos;re typing directly on the page. You can also edit it here:</p>
          {getPath(content, textOnly) !== undefined && (isRich(textOnly) ? <RichField path={textOnly} /> : <TextField path={textOnly} multiline />)}
        </div>
      )}

      <details className="ed-all" open={showAll} key={`${group}-${showAll}`}>
        <summary>{showAll ? groupLabel(group) : `Everything in “${groupLabel(group)}”`}</summary>
        <AutoForm path={group} />
      </details>
    </div>
  );
}
