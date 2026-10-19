import { EditorApp } from "@/editor/EditorApp";
import { requireAdminPage } from "@/lib/server/auth";
import { ensureSeeded, getDraft } from "@/lib/server/content";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await requireAdminPage();
  await ensureSeeded();
  const draft = await getDraft();
  return <EditorApp initial={draft.content} hasUnpublished={draft.hasUnpublished} email={user.email} />;
}
