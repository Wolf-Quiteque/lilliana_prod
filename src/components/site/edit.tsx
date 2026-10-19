"use client";

import { createContext, useContext, useLayoutEffect, useRef, type CSSProperties, type ElementType, type ReactNode } from "react";
import { getPath } from "@/lib/content/paths";
import { isRich } from "@/lib/content/schema";
import type { LinkItem, Media, SiteContent } from "@/lib/content/types";
import { cleanRichHtml } from "@/lib/content/rich-client";

// The public site and the editor canvas render the same components. On the public site these
// primitives output plain markup; inside the editor they become editable in place.

export type SelectKind = "text" | "rich" | "link" | "image" | "video" | "item" | "section";

export type EditApi = {
  editing: boolean;
  select: (path: string, kind: SelectKind) => void;
  change: (path: string, value: unknown) => void;
};

const noop = () => {};
const EditContext = createContext<EditApi>({ editing: false, select: noop, change: noop });
const ContentContext = createContext<SiteContent | null>(null);

export function SiteProviders({ content, edit, children }: { content: SiteContent; edit?: EditApi; children: ReactNode }) {
  return (
    <ContentContext.Provider value={content}>
      <EditContext.Provider value={edit ?? { editing: false, select: noop, change: noop }}>{children}</EditContext.Provider>
    </ContentContext.Provider>
  );
}

export const useEdit = () => useContext(EditContext);

export function useContent(): SiteContent {
  const c = useContext(ContentContext);
  if (!c) throw new Error("useContent outside SiteProviders");
  return c;
}

export function useValue<T>(path: string): T {
  return getPath<T>(useContent(), path);
}

type TextProps = {
  p: string;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
  placeholder?: string;
} & Record<string, unknown>;

/** Editable text. Rich fields render a small HTML subset (accent highlight, bold, links, breaks). */
export function T({ p, as: Tag = "span", className, style, placeholder, ...rest }: TextProps) {
  const value = useValue<string>(p) ?? "";
  const { editing } = useEdit();
  const rich = isRich(p);
  const cls = rich ? [className, "lp-rich"].filter(Boolean).join(" ") : className;

  if (editing) return <EditableText p={p} as={Tag} rich={rich} value={value} className={cls} style={style} placeholder={placeholder} {...rest} />;
  if (rich) return <Tag className={cls} style={style} dangerouslySetInnerHTML={{ __html: value }} {...rest} />;
  return (
    <Tag className={cls} style={style} {...rest}>
      {value}
    </Tag>
  );
}

function EditableText({
  p,
  as: Tag,
  rich,
  value,
  className,
  style,
  placeholder,
  ...rest
}: { p: string; as: ElementType; rich: boolean; value: string; className?: string; style?: CSSProperties; placeholder?: string } & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  const { change, select } = useEdit();

  // The element is uncontrolled while focused so the caret never jumps; outside changes
  // (undo, inspector edits) are written in when it isn't being typed in.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (rich) {
      if (el.innerHTML !== value) el.innerHTML = value;
    } else if (readPlain(el) !== value) {
      el.innerText = value;
    }
  }, [value, rich]);

  const read = () => {
    const el = ref.current!;
    return rich ? cleanRichHtml(el.innerHTML) : readPlain(el);
  };

  return (
    <Tag
      ref={ref}
      className={className}
      style={style}
      contentEditable={rich ? true : "plaintext-only"}
      suppressContentEditableWarning
      spellCheck
      data-edit-path={p}
      data-edit-kind={rich ? "rich" : "text"}
      data-placeholder={placeholder ?? "Type here…"}
      onFocus={() => select(p, rich ? "rich" : "text")}
      onInput={() => change(p, read())}
      onBlur={() => {
        // Tidy the markup once typing stops
        const el = ref.current;
        if (el && rich && el.innerHTML !== value) el.innerHTML = value;
      }}
      onKeyDown={(e: React.KeyboardEvent<HTMLElement>) => {
        if (e.key === "Enter") {
          e.preventDefault();
          if (rich) document.execCommand("insertLineBreak");
          else if (Tag === "p" || e.shiftKey) document.execCommand("insertLineBreak");
          else (e.currentTarget as HTMLElement).blur();
        }
      }}
      onPaste={(e: React.ClipboardEvent<HTMLElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
      onDrop={(e: React.DragEvent) => e.preventDefault()}
      {...rest}
    />
  );
}

/** Text as typed. innerText would return it as displayed (e.g. upper-cased by CSS). */
function readPlain(el: HTMLElement): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) out += node.textContent ?? "";
    else if (node.nodeName === "BR") out += "\n";
    else {
      if ((node.nodeName === "DIV" || node.nodeName === "P") && out && !out.endsWith("\n")) out += "\n";
      node.childNodes.forEach(walk);
    }
  };
  el.childNodes.forEach(walk);
  return out.replace(/\u00a0/g, " ").replace(/\n$/, "");
}

type LinkProps = {
  p: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  onClick?: () => void;
} & Record<string, unknown>;

/** A link whose label is edited in place and whose address is edited in the side panel. */
export function L({ p, className, style, children, onClick, ...rest }: LinkProps) {
  const link = useValue<LinkItem>(p);
  const { editing } = useEdit();
  const external = /^https?:/i.test(link?.href ?? "");
  return (
    <a
      href={link?.href || undefined}
      className={className}
      style={style}
      onClick={onClick}
      {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
      {...(editing ? { "data-edit-link": p } : {})}
      {...rest}
    >
      {children}
      {editing ? <T p={`${p}.label`} /> : link?.label}
    </a>
  );
}

type ImgProps = { p: string; style?: CSSProperties; className?: string; alt?: string } & Record<string, unknown>;

export function Img({ p, style, className, ...rest }: ImgProps) {
  const media = useValue<Media>(p);
  const { editing } = useEdit();
  if (!media?.url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={media.url}
      alt={media.alt}
      className={className}
      style={{ ...style, objectPosition: media.focus || undefined }}
      loading="lazy"
      decoding="async"
      {...(editing ? { "data-edit-path": p, "data-edit-kind": "image" } : {})}
      {...rest}
    />
  );
}

/** data-* attributes that make an element selectable in the editor (no-ops on the public site) */
export function useEditAttrs() {
  const { editing } = useEdit();
  return {
    item: (path: string) => (editing ? { "data-edit-item": path } : {}),
    section: (id: string) => (editing ? { "data-edit-section": id } : {}),
    target: (path: string, kind: SelectKind) => (editing ? { "data-edit-path": path, "data-edit-kind": kind } : {}),
  };
}
