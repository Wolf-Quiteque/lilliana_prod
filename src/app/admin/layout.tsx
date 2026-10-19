import type { Metadata } from "next";
import "@/editor/admin.css";

export const metadata: Metadata = { title: "Lillis Productions — Editor", robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="ed-root">{children}</div>;
}
