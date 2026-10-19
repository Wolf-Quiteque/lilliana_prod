import type { Metadata } from "next";
import { preload } from "react-dom";
import { getPublishedContent } from "@/lib/server/content";
import "./site.css";

export async function generateMetadata(): Promise<Metadata> {
  const c = await getPublishedContent();
  const images = c.settings.ogImage ? [{ url: c.settings.ogImage }] : undefined;
  return {
    title: c.settings.seoTitle,
    description: c.settings.seoDescription,
    icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } },
    openGraph: { title: c.settings.seoTitle, description: c.settings.seoDescription, type: "website", siteName: c.brand.name, images },
    twitter: { card: images ? "summary_large_image" : "summary", title: c.settings.seoTitle, description: c.settings.seoDescription, images: images?.map((i) => i.url) },
  };
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  // Latin subsets of Archivo (headings) and Manrope (body)
  preload("/fonts/95077e0c-cf22-43b4-b982-83c2092c654b.woff2", { as: "font", type: "font/woff2", crossOrigin: "" });
  preload("/fonts/d801d71f-8f48-44fe-9b71-ec0451b14dcd.woff2", { as: "font", type: "font/woff2", crossOrigin: "" });
  return children;
}
