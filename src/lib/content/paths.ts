// Dot-path helpers ("hero.videos.0.url") used by the editor to read and update nested content
// without mutating it.

export type Path = string;

export function splitPath(path: Path): (string | number)[] {
  if (!path) return [];
  return path.split(".").map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

export function getPath<T = unknown>(obj: unknown, path: Path): T {
  let cur: unknown = obj;
  for (const key of splitPath(path)) {
    if (cur == null) return undefined as T;
    cur = (cur as Record<string | number, unknown>)[key];
  }
  return cur as T;
}

export function setPath<T>(obj: T, path: Path, value: unknown): T {
  const keys = splitPath(path);
  if (keys.length === 0) return value as T;
  const write = (node: unknown, i: number): unknown => {
    const key = keys[i];
    const base = Array.isArray(node) ? [...node] : { ...(node as Record<string, unknown>) };
    const next = i === keys.length - 1 ? value : write((node as Record<string | number, unknown>)?.[key], i + 1);
    (base as Record<string | number, unknown>)[key] = next;
    return base;
  };
  return write(obj, 0) as T;
}

/** "packages.items.2.features.0" -> "packages.items.*.features.*" */
export function patternOf(path: Path): string {
  return splitPath(path)
    .map((k) => (typeof k === "number" ? "*" : k))
    .join(".");
}

export function parentPath(path: Path): { list: Path; index: number } | null {
  const keys = splitPath(path);
  const last = keys[keys.length - 1];
  if (typeof last !== "number") return null;
  return { list: keys.slice(0, -1).join("."), index: last };
}

export function newId(prefix = "i"): string {
  return `${prefix}${Math.random().toString(36).slice(2, 9)}`;
}
