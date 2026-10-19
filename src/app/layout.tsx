import type { Metadata, Viewport } from "next";
import { getPublishedContent } from "@/lib/server/content";

export const metadata: Metadata = { icons: { icon: { url: "/favicon.svg", type: "image/svg+xml" } } };

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

// Picks the colour mode before first paint: the visitor's own choice, then the site default,
// then the device setting. Same rules as the original page.
const THEME_SCRIPT = `(function(){try{var d=document.documentElement,s=null;try{s=localStorage.getItem('lp-theme')}catch(e){}var f=d.getAttribute('data-default-theme');var t=(s==='light'||s==='dark')?s:(f==='light'||f==='dark')?f:(window.matchMedia('(prefers-color-scheme: light)').matches?'light':'dark');d.setAttribute('data-theme',t)}catch(e){}})();`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const c = await getPublishedContent();
  return (
    <html lang="en" data-default-theme={c.settings.theme} style={{ "--accent": c.settings.accent } as React.CSSProperties} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
