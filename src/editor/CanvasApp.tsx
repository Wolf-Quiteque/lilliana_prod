"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Site } from "@/components/site/Site";
import type { EditApi, SelectKind } from "@/components/site/edit";
import { parentPath } from "@/lib/content/paths";
import type { SiteContent } from "@/lib/content/types";
import { groupLabel } from "./labels";
import { isSameOrigin, type FromCanvas, type ListOp, type ToCanvas } from "./protocol";
import "./canvas.css";

type Box = { path: string; rect: DOMRect };

const post = (m: FromCanvas) => window.parent.postMessage(m, window.location.origin);

/** Runs inside the editor's preview iframe: renders the real site with editing turned on. */
export function CanvasApp() {
  const [content, setContent] = useState<SiteContent | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [hoverItem, setHoverItem] = useState<Box | null>(null);
  const [hoverSection, setHoverSection] = useState<Box | null>(null);
  const [richBox, setRichBox] = useState<DOMRect | null>(null);
  const [, setTick] = useState(0);
  const uiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (!isSameOrigin(e)) return;
      const m = e.data as ToCanvas;
      if (m.type === "content") {
        setContent(m.content);
        setSelected(m.selected);
        setPreview(m.preview);
      } else if (m.type === "scrollTo") {
        const sel = CSS.escape(m.target);
        const el = document.querySelector(`[data-edit-section="${sel}"],[data-edit-item="${sel}"],[data-edit-path="${sel}"]`);
        el?.scrollIntoView({ behavior: "smooth", block: m.target.includes(".") ? "center" : "start" });
      }
    };
    window.addEventListener("message", onMsg);
    post({ type: "ready" });
    return () => window.removeEventListener("message", onMsg);
  }, []);

  // Colour settings apply live, but a mode picked with the site's own toggle wins (same as visitors)
  const theme = content?.settings.theme;
  const accent = content?.settings.accent;
  useEffect(() => {
    if (!theme || !accent) return;
    const d = document.documentElement;
    d.style.setProperty("--accent", accent);
    d.setAttribute("data-default-theme", theme);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem("lp-theme");
    } catch {}
    if (saved !== "light" && saved !== "dark") {
      d.setAttribute("data-theme", theme === "auto" ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark") : theme);
    }
  }, [theme, accent]);

  const select = useCallback((path: string, kind: SelectKind) => {
    setSelected(path);
    post({ type: "select", path, kind });
  }, []);

  const edit: EditApi = useMemo(
    () => ({ editing: true, select, change: (path, value) => post({ type: "change", path, value }) }),
    [select],
  );

  // Clicks select things instead of following links or submitting the form
  useEffect(() => {
    if (preview) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (uiRef.current?.contains(t)) return;
      if (t.closest("a")) e.preventDefault();
      if (t.closest('button[type="submit"]')) e.preventDefault();
      const target = t.closest<HTMLElement>("[data-edit-path]");
      if (target) {
        const kind = target.dataset.editKind as SelectKind;
        if (kind !== "text" && kind !== "rich") select(target.dataset.editPath!, kind);
        return;
      }
      const link = t.closest<HTMLElement>("[data-edit-link]");
      if (link) return select(link.dataset.editLink!, "link");
      const item = t.closest<HTMLElement>("[data-edit-item]");
      if (item) return select(item.dataset.editItem!, "item");
      const section = t.closest<HTMLElement>("[data-edit-section]");
      if (section) select(section.dataset.editSection!, "section");
    };
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const k = e.key.toLowerCase();
      if (k === "z" || k === "y") {
        e.preventDefault();
        (document.activeElement as HTMLElement | null)?.blur();
        post({ type: "key", key: (k === "z" && e.shiftKey) || k === "y" ? "redo" : "undo" });
      } else if (k === "s") {
        e.preventDefault();
        post({ type: "key", key: "save" });
      }
    };
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [select, preview]);

  // Hover outlines and the floating toolbars follow the pointer, scrolling and focus
  useEffect(() => {
    let lastTarget: HTMLElement | null = null;
    const measure = () => {
      const t = lastTarget;
      const item = t?.closest<HTMLElement>("[data-edit-item]");
      const section = t?.closest<HTMLElement>("[data-edit-section]");
      setHoverItem(item ? { path: item.dataset.editItem!, rect: item.getBoundingClientRect() } : null);
      setHoverSection(section ? { path: section.dataset.editSection!, rect: section.getBoundingClientRect() } : null);
      const active = document.activeElement as HTMLElement | null;
      setRichBox(active?.dataset?.editKind === "rich" ? active.getBoundingClientRect() : null);
      setTick((n) => n + 1);
    };
    const onMove = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (uiRef.current?.contains(t)) return; // keep the toolbar for the item it belongs to
      lastTarget = t;
      measure();
    };
    const onLeave = () => {
      lastTarget = null;
      measure();
    };
    document.addEventListener("mousemove", onMove, { passive: true });
    document.documentElement.addEventListener("mouseleave", onLeave);
    window.addEventListener("scroll", measure, { passive: true, capture: true });
    window.addEventListener("resize", measure);
    document.addEventListener("focusin", measure);
    document.addEventListener("focusout", () => setTimeout(measure, 0));
    document.addEventListener("input", measure);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.documentElement.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("scroll", measure, { capture: true });
      window.removeEventListener("resize", measure);
      document.removeEventListener("focusin", measure);
      document.removeEventListener("input", measure);
    };
  }, []);

  // Outline the selected element
  useEffect(() => {
    document.querySelectorAll(".lp-selected").forEach((el) => el.classList.remove("lp-selected"));
    if (!selected || !content) return;
    const sel = CSS.escape(selected);
    document
      .querySelectorAll(`[data-edit-item="${sel}"],[data-edit-path="${sel}"]:not([contenteditable]),[data-edit-link="${sel}"]`)
      .forEach((el) => el.classList.add("lp-selected"));
  }, [selected, content]);

  if (!content) return <div style={{ padding: 40, fontFamily: "system-ui", color: "#888" }}>Loading the editor…</div>;
  if (preview) return <Site content={content} />;

  // Toolbar for the hovered list item, or the selected one when nothing is hovered
  let itemBox = hoverItem;
  if (!itemBox && selected && parentPath(selected)) {
    const el = document.querySelector<HTMLElement>(`[data-edit-item="${CSS.escape(selected)}"]`);
    if (el) itemBox = { path: selected, rect: el.getBoundingClientRect() };
  }
  const listOp = (op: ListOp, path: string) => post({ type: "list", op, path });

  return (
    <>
      <Site content={content} edit={edit} />
      <div ref={uiRef} className="lp-canvas-ui">
        {hoverSection && !richBox && (
          <div className="lp-cv-chip" style={{ top: Math.max(6, hoverSection.rect.top + 6), left: Math.max(6, hoverSection.rect.left + 6) }}>
            <button type="button" onClick={() => select(hoverSection.path, "section")}>
              {groupLabel(hoverSection.path)}
              {content.sections.hidden.includes(hoverSection.path as never) ? " · hidden" : ""} — edit section
            </button>
          </div>
        )}
        {itemBox && !richBox && (
          <div className="lp-cv-tools" style={{ top: Math.max(6, itemBox.rect.top - 34), left: Math.max(6, itemBox.rect.right - 184) }}>
            <button type="button" title="Move earlier" onClick={() => listOp("up", itemBox!.path)}>
              ↑
            </button>
            <button type="button" title="Move later" onClick={() => listOp("down", itemBox!.path)}>
              ↓
            </button>
            <button type="button" title="Duplicate" onClick={() => listOp("dup", itemBox!.path)}>
              ⧉
            </button>
            <button type="button" title="Add a new one after this" onClick={() => listOp("add", itemBox!.path)}>
              +
            </button>
            <button type="button" title="Settings" onClick={() => select(itemBox!.path, "item")}>
              ⚙
            </button>
            <button type="button" title="Delete" className="danger" onClick={() => listOp("del", itemBox!.path)}>
              ✕
            </button>
          </div>
        )}
        {richBox && <RichToolbar rect={richBox} />}
      </div>
    </>
  );
}

function RichToolbar({ rect }: { rect: DOMRect }) {
  const run = (cmd: string, value?: string) => (e: React.MouseEvent) => {
    e.preventDefault(); // keep the text focused and selected
    document.execCommand(cmd, false, value);
  };
  const link = (e: React.MouseEvent) => {
    e.preventDefault();
    const url = window.prompt("Link address (https://…, #contact, tel:…, mailto:…)", "https://");
    if (url) document.execCommand("createLink", false, url);
  };
  const clear = (e: React.MouseEvent) => {
    e.preventDefault();
    document.execCommand("removeFormat");
    document.execCommand("unlink");
  };
  return (
    <div className="lp-cv-tools lp-cv-rich" style={{ top: rect.top > 44 ? rect.top - 40 : rect.bottom + 6, left: Math.max(6, rect.left) }}>
      <button type="button" onMouseDown={run("italic")} title="Colour the selected words with the accent colour">
        <span style={{ color: "#e13b82", fontWeight: 700 }}>Accent</span>
      </button>
      <button type="button" onMouseDown={run("bold")} title="Bold">
        <b>B</b>
      </button>
      <button type="button" onMouseDown={link} title="Link">
        Link
      </button>
      <button type="button" onMouseDown={clear} title="Remove formatting">
        Clear
      </button>
      <span className="lp-cv-hint">Enter = new line</span>
    </div>
  );
}
