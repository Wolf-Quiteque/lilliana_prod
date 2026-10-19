import type { SelectKind } from "@/components/site/edit";
import type { SiteContent } from "@/lib/content/types";

// postMessage protocol between the editor (parent window) and the canvas (iframe).

export type ListOp = "up" | "down" | "dup" | "del" | "add";

export type ToCanvas =
  | { type: "content"; content: SiteContent; selected: string | null; preview: boolean }
  | { type: "scrollTo"; target: string };

export type FromCanvas =
  | { type: "ready" }
  | { type: "change"; path: string; value: unknown }
  | { type: "select"; path: string; kind: SelectKind }
  | { type: "list"; op: ListOp; path: string }
  | { type: "key"; key: "undo" | "redo" | "save" };

export const isSameOrigin = (e: MessageEvent) => e.origin === window.location.origin;
