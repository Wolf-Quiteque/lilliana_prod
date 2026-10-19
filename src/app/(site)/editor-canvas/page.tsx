import type { Metadata } from "next";
import { CanvasApp } from "@/editor/CanvasApp";
import { requireAdminPage } from "@/lib/server/auth";

export const metadata: Metadata = { title: "Editor preview", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

export default async function EditorCanvasPage() {
  await requireAdminPage();
  return <CanvasApp />;
}
