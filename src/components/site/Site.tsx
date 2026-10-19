"use client";

import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import type { SectionId, SiteContent } from "@/lib/content/types";
import { Img, L, SiteProviders, T, useContent, useEdit, useEditAttrs, type EditApi } from "./edit";
import { SocialIcon } from "./icons";
import { VideoCard } from "./VideoCard";

// Styles are carried over 1:1 from the original hand-built page.

const ARCHIVO = "Archivo, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const WRAP: CSSProperties = { maxWidth: 1240, margin: "0 auto", padding: "0 clamp(18px, 5vw, 28px)" };
const SECTION_PAD = "clamp(60px, 9vw, 96px)";
const eyebrow: CSSProperties = { fontSize: 12.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--accent)" };
const h2: CSSProperties = { margin: 0, fontFamily: ARCHIVO, fontWeight: 700, fontSize: "clamp(34px, 4.4vw, 58px)", lineHeight: 1.02, letterSpacing: "-0.03em" };

export function Site({ content, edit }: { content: SiteContent; edit?: EditApi }) {
  return (
    <SiteProviders content={content} edit={edit}>
      <div className={edit?.editing ? "lp-editing" : undefined} style={{ background: "var(--bg)", color: "var(--text)", minHeight: "100vh", overflowX: "hidden" }}>
        <Header />
        <Sections />
        <Footer />
      </div>
    </SiteProviders>
  );
}

const SECTIONS: Record<SectionId, () => React.ReactNode> = {
  hero: Hero,
  marquee: Marquee,
  meet: Meet,
  services: Services,
  work: Work,
  clients: Clients,
  packages: Packages,
  praise: Praise,
  contact: Contact,
};

function Sections() {
  const c = useContent();
  const { editing } = useEdit();
  return (
    <>
      {c.sections.order.map((id) => {
        const hidden = c.sections.hidden.includes(id);
        if (hidden && !editing) return null;
        const Section = SECTIONS[id];
        return hidden ? (
          <div key={id} data-hidden-section={id}>
            <Section />
          </div>
        ) : (
          <Section key={id} />
        );
      })}
    </>
  );
}

/* ---------------------------------------------------------------- header */

function useTheme() {
  const [light, setLight] = useState<boolean | null>(null);
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => setLight(root.getAttribute("data-theme") === "light");
    sync();
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const onSystem = () => {
      let saved: string | null = null;
      try {
        saved = localStorage.getItem("lp-theme");
      } catch {}
      const def = root.getAttribute("data-default-theme");
      if (saved !== "light" && saved !== "dark" && def !== "light" && def !== "dark") {
        root.setAttribute("data-theme", mq.matches ? "light" : "dark");
      }
    };
    mq.addEventListener("change", onSystem);
    const obs = new MutationObserver(sync);
    obs.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq.removeEventListener("change", onSystem);
      obs.disconnect();
    };
  }, []);
  const toggle = () => {
    const next = document.documentElement.getAttribute("data-theme") === "light" ? "dark" : "light";
    try {
      localStorage.setItem("lp-theme", next);
    } catch {}
    document.documentElement.setAttribute("data-theme", next);
  };
  return { light, toggle };
}

function Header() {
  const c = useContent();
  const a = useEditAttrs();
  const { light, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const themeLabel = light ? "Switch to dark mode" : "Switch to light mode";

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 760px)");
    const close = () => setMenuOpen(false);
    mq.addEventListener("change", close);
    return () => mq.removeEventListener("change", close);
  }, []);

  return (
    <header
      {...a.section("header")}
      style={{ position: "sticky", top: 0, zIndex: 60, backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", background: "color-mix(in oklab, var(--bg) 82%, transparent)", borderBottom: "1px solid var(--line)" }}
    >
      <div className="lp-header-row" style={{ maxWidth: 1240, margin: "0 auto", padding: "12px clamp(16px, 4vw, 28px)", display: "flex", alignItems: "center", gap: 28 }}>
        <a href="#top" className="lp-brand" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--text)" }}>
          <Img p="brand.logo" style={{ width: 46, height: 46, objectFit: "contain", filter: "var(--logo-filter)", mixBlendMode: "var(--logo-blend)" as CSSProperties["mixBlendMode"] }} loading="eager" />
          <T p="brand.name" style={{ fontFamily: ARCHIVO, fontSize: 19, fontWeight: 600, letterSpacing: "0.01em", lineHeight: 1 }} />
        </a>
        <nav className="lp-nav" style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "14px 30px", justifyContent: "flex-end" }}>
          {c.header.links.map((l, i) => (
            <L
              key={l.id}
              p={`header.links.${i}`}
              {...a.item(`header.links.${i}`)}
              className="lp-wide-only hv-text"
              style={{ color: "var(--muted)", fontSize: 13.5, letterSpacing: "0.10em", textTransform: "uppercase" }}
            />
          ))}
          <button
            type="button"
            onClick={toggle}
            aria-label={themeLabel}
            title={themeLabel}
            className="hv-border"
            style={{ position: "relative", width: 52, height: 30, minWidth: 52, borderRadius: 999, border: "1px solid var(--line)", background: "var(--surface)", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
          >
            <span
              className="lp-theme-knob"
              style={{ position: "absolute", width: 22, height: 22, borderRadius: "50%", background: "var(--accent)", transition: "left 220ms cubic-bezier(.4,.1,.2,1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#fff" }}
            >
              <span className="lp-theme-sun">☼</span>
              <span className="lp-theme-moon">☽</span>
            </span>
          </button>
          <L
            p="header.cta"
            className="lp-header-cta hv-invert"
            style={{ background: "var(--accent)", color: "#fff", padding: "13px 20px", borderRadius: 999, fontSize: 13.5, fontWeight: 600, letterSpacing: "0.04em", whiteSpace: "nowrap" }}
          />
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-label="Menu"
            aria-expanded={menuOpen}
            className="lp-menu-btn lp-narrow-only"
            style={{ width: 46, height: 46, minWidth: 46, borderRadius: 14, border: "1px solid var(--line)", background: "transparent", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 5, padding: 0 }}
          >
            {[0, 1, 2].map((i) => (
              <span key={i} style={{ width: 18, height: 1.5, background: "var(--text)", display: "block" }} />
            ))}
          </button>
        </nav>
      </div>
      {menuOpen && (
        <div className="lp-narrow-only" style={{ borderTop: "1px solid var(--line)", background: "var(--bg)", padding: "10px 22px 20px", flexDirection: "column" }}>
          {c.header.links.map((l, i) => (
            <L
              key={l.id}
              p={`header.links.${i}`}
              onClick={() => setMenuOpen(false)}
              style={{ color: "var(--text)", fontSize: 16, padding: "15px 4px", borderBottom: i < c.header.links.length - 1 ? "1px solid var(--line)" : undefined }}
            />
          ))}
          {c.header.call.label && (
            <L p="header.call" onClick={() => setMenuOpen(false)} style={{ color: "var(--muted)", fontSize: 15, padding: "14px 4px" }} />
          )}
        </div>
      )}
    </header>
  );
}

/* ------------------------------------------------------------------ hero */

function Hero() {
  const c = useContent();
  const a = useEditAttrs();
  return (
    <section
      id="top"
      {...a.section("hero")}
      style={{ position: "relative", padding: "clamp(24px, 4vw, 56px) clamp(18px, 5vw, 28px) clamp(36px, 5vw, 56px)", maxWidth: 1240, margin: "0 auto" }}
    >
      <div
        style={{ position: "absolute", top: -140, right: -120, width: "min(520px, 90vw)", height: "min(520px, 90vw)", borderRadius: "50%", background: "radial-gradient(circle, color-mix(in oklab, var(--accent) 38%, transparent) 0%, transparent 68%)", filter: "blur(20px)", pointerEvents: "none" }}
      />
      <div className="lp-hero-grid" style={{ position: "relative" }}>
        <div className="lp-hero-copy">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ width: 34, height: 1, background: "var(--accent)" }} />
            <T p="hero.eyebrow" style={{ fontSize: 12.5, letterSpacing: "0.22em", textTransform: "uppercase", color: "var(--muted)" }} />
          </div>
          <T
            p="hero.title"
            as="h1"
            style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 700, fontSize: "clamp(28px, 3.6vw, 52px)", lineHeight: 1.05, letterSpacing: "-0.02em" }}
          />
          <T p="hero.body" as="p" style={{ margin: 0, maxWidth: 520, fontSize: "clamp(14.5px, 1.5vw, 16.5px)", lineHeight: 1.55, color: "var(--muted)" }} />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 12px", alignItems: "center" }}>
            <L p="hero.primary" className="hv-invert" style={{ background: "var(--accent)", color: "#fff", padding: "13px 24px", borderRadius: 999, fontWeight: 600, fontSize: 15, letterSpacing: "0.02em" }} />
            <L p="hero.secondary" className="hv-outline" style={{ border: "1px solid var(--line)", color: "var(--text)", padding: "13px 24px", borderRadius: 999, fontWeight: 500, fontSize: 15 }} />
            {c.hero.phone.label && <L p="hero.phone" className="hv-text" style={{ color: "var(--muted)", fontSize: 15, padding: "8px 0" }} />}
          </div>
        </div>
        {c.hero.videos.length > 0 && (
          <div className="lp-reels" aria-label={c.hero.videosLabel}>
            {c.hero.videos.map((v, i) => (
              <VideoCard key={v.id} video={v} path={`hero.videos.${i}`} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- marquee */

function Marquee() {
  const c = useContent();
  const a = useEditAttrs();
  const { editing } = useEdit();
  const word: CSSProperties = { fontFamily: ARCHIVO, fontSize: 21, fontWeight: 500, letterSpacing: "-0.01em", color: "var(--muted)" };
  const group = (copy: number) => (
    <div style={{ display: "flex", gap: 44, alignItems: "center" }} aria-hidden={copy === 1 || undefined}>
      {c.marquee.items.map((m, i) => (
        <span key={m.id} style={{ display: "contents" }}>
          {copy === 0 ? <T p={`marquee.items.${i}.text`} style={word} {...a.item(`marquee.items.${i}`)} /> : <span style={word}>{m.text}</span>}
          <span style={{ color: "var(--accent)" }}>•</span>
        </span>
      ))}
    </div>
  );
  return (
    <div {...a.section("marquee")} style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", overflow: "hidden", padding: "16px 0", background: "var(--surface)" }}>
      <div style={{ display: "flex", width: "max-content", gap: 44, animation: "lp-marquee 32s linear infinite", willChange: "transform", animationPlayState: editing ? "paused" : undefined }}>
        {group(0)}
        {group(1)}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- meet */

function Meet() {
  const c = useContent();
  const a = useEditAttrs();
  return (
    <section
      id="meet"
      {...a.section("meet")}
      style={{ borderBottom: "1px solid var(--line)", maxWidth: 1240, margin: "0 auto", padding: "clamp(56px, 8vw, 96px) clamp(18px, 5vw, 28px)" }}
    >
      <div className="lp-meet">
        <figure
          {...a.target("meet.photo", "image")}
          style={{ margin: 0, position: "relative", aspectRatio: "4 / 5", overflow: "hidden", border: "1px solid var(--line)", borderRadius: "clamp(22px, 4vw, 30px)", background: "radial-gradient(circle at 30% 20%, color-mix(in oklab, var(--accent) 32%, var(--surface)) 0%, var(--surface) 70%)" }}
        >
          {!c.meet.photo.url && (
            <span style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", textAlign: "center", padding: 24, color: "var(--muted)", fontSize: 13, letterSpacing: ".16em", textTransform: "uppercase", whiteSpace: "pre-line" }}>
              {c.meet.placeholder}
            </span>
          )}
          <Img p="meet.photo" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        </figure>
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <T p="meet.eyebrow" style={{ fontSize: 12.5, letterSpacing: ".22em", textTransform: "uppercase", color: "var(--accent)" }} />
          <T p="meet.title" as="h2" style={{ margin: 0, fontFamily: ARCHIVO, fontSize: "clamp(30px, 4vw, 52px)", lineHeight: 1.04, letterSpacing: "-.03em" }} />
          {c.meet.paragraphs.map((p, i) => (
            <T
              key={p.id}
              p={`meet.paragraphs.${i}.text`}
              as="p"
              {...a.item(`meet.paragraphs.${i}`)}
              style={{ margin: 0, maxWidth: 560, fontSize: 17, lineHeight: 1.65, color: "var(--muted)" }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- services */

function Services() {
  const c = useContent();
  const a = useEditAttrs();
  return (
    <section id="services" {...a.section("services")} style={{ maxWidth: 1240, margin: "0 auto", padding: `${SECTION_PAD} clamp(18px, 5vw, 28px)` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "32px 56px", alignItems: "start", marginBottom: 54 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <T p="services.eyebrow" style={eyebrow} />
          <T p="services.title" as="h2" style={{ ...h2, letterSpacing: "-0.01em" }} />
        </div>
        <T p="services.intro" as="p" style={{ margin: 0, alignSelf: "end", fontSize: 17.5, lineHeight: 1.68, color: "var(--muted)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 20 }}>
        {c.services.items.map((s, i) => (
          <article
            key={s.id}
            {...a.item(`services.items.${i}`)}
            className="hv-lift"
            style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 20, padding: "clamp(24px, 4.5vw, 30px) clamp(20px, 4vw, 28px) clamp(26px, 4.5vw, 34px)", display: "flex", flexDirection: "column", gap: 14, minHeight: 232 }}
          >
            <T p={`services.items.${i}.num`} style={{ fontFamily: ARCHIVO, fontSize: 15, color: "var(--accent)", letterSpacing: "0.14em" }} />
            <T p={`services.items.${i}.title`} as="h3" style={{ margin: 0, fontSize: 21, fontWeight: 600, letterSpacing: "-0.01em" }} />
            <T p={`services.items.${i}.body`} as="p" style={{ margin: 0, fontSize: 15.5, lineHeight: 1.6, color: "var(--muted)" }} />
          </article>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- work */

function Work() {
  const c = useContent();
  const a = useEditAttrs();
  return (
    <section id="work" {...a.section("work")} style={{ borderTop: "1px solid var(--line)", background: "var(--surface)", padding: `${SECTION_PAD} 0` }}>
      <div style={{ ...WRAP, display: "flex", flexDirection: "column", gap: 40 }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <T p="work.eyebrow" style={eyebrow} />
            <T p="work.title" as="h2" style={h2} />
          </div>
          <T p="work.intro" as="p" style={{ margin: 0, maxWidth: 420, fontSize: 16.5, lineHeight: 1.6, color: "var(--muted)" }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gridAutoRows: "clamp(280px, 32vw, 390px)", gap: "clamp(14px, 2.4vw, 20px)" }}>
          {c.work.items.map((g, i) => (
            <figure
              key={g.id}
              {...a.item(`work.items.${i}`)}
              className="hv-border"
              style={{ margin: 0, position: "relative", overflow: "hidden", borderRadius: 18, border: "1px solid var(--line)", gridColumn: "span 1", gridRow: "span 1", background: "repeating-linear-gradient(135deg, var(--surface2) 0 9px, var(--bg) 9px 18px)", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <Img p={`work.items.${i}.image`} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 48%, rgba(13,12,13,.78) 100%)", pointerEvents: "none" }} />
              <T
                p={`work.items.${i}.label`}
                as="figcaption"
                style={{ position: "absolute", zIndex: 1, left: 18, bottom: 18, fontSize: 11, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "#fff", background: "color-mix(in oklab, var(--bg) 72%, transparent)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,.18)", padding: "9px 12px", borderRadius: 999, textAlign: "center" }}
              />
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- clients */

function Clients() {
  const a = useEditAttrs();
  return (
    <section id="clients" {...a.section("clients")} style={{ borderTop: "1px solid var(--line)", background: "var(--bg)", padding: "clamp(40px, 7vw, 72px) 0" }}>
      <div style={{ ...WRAP, display: "flex", flexDirection: "column", gap: 36 }}>
        <aside
          aria-label="Local content collaboration"
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))", overflow: "hidden", border: "1px solid var(--line)", borderRadius: 22, background: "var(--surface)" }}
        >
          <div style={{ position: "relative", minHeight: 320, overflow: "hidden" }}>
            <Img p="clients.image" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
            <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, transparent 58%, color-mix(in oklab, var(--surface) 42%, transparent))", pointerEvents: "none" }} />
          </div>
          <div style={{ padding: "clamp(24px, 5vw, 48px)", display: "flex", flexDirection: "column", justifyContent: "center", gap: 16 }}>
            <T p="clients.eyebrow" style={{ fontSize: 12, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--accent)" }} />
            <T p="clients.title" as="h3" style={{ margin: 0, fontFamily: ARCHIVO, fontSize: "clamp(27px, 3vw, 40px)", lineHeight: 1.08, letterSpacing: "-.03em" }} />
            <T p="clients.body" as="p" style={{ margin: 0, color: "var(--muted)", lineHeight: 1.65 }} />
          </div>
        </aside>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- packages */

function Packages() {
  const c = useContent();
  const a = useEditAttrs();
  return (
    <section id="packages" {...a.section("packages")} style={{ maxWidth: 1240, margin: "0 auto", padding: `${SECTION_PAD} clamp(18px, 5vw, 28px)` }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center", marginBottom: 48 }}>
        <T p="packages.eyebrow" style={eyebrow} />
        <T p="packages.title" as="h2" style={h2} />
        <T p="packages.intro" as="p" style={{ margin: 0, maxWidth: 560, fontSize: 17, lineHeight: 1.65, color: "var(--muted)" }} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 20, alignItems: "start" }}>
        {c.packages.items.map((p, i) => {
          const base = `packages.items.${i}`;
          const border = p.featured ? "var(--accent)" : "var(--line)";
          return (
            <article
              key={p.id}
              {...a.item(base)}
              style={{ border: `1px solid ${border}`, background: p.featured ? "color-mix(in oklab, var(--accent) var(--featured-mix), var(--surface))" : "var(--surface)", borderRadius: 24, padding: "clamp(26px, 5vw, 34px) clamp(22px, 4vw, 30px) clamp(28px, 5vw, 36px)", display: "flex", flexDirection: "column", gap: 22 }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <T p={`${base}.name`} as="h3" style={{ margin: 0, fontFamily: ARCHIVO, fontWeight: 700, letterSpacing: "-0.02em", fontSize: 28 }} />
                <T p={`${base}.tag`} style={{ fontSize: 11.5, letterSpacing: "0.16em", textTransform: "uppercase", color: p.featured ? "var(--accent)" : "var(--muted)" }} />
              </div>
              {c.settings.showPricing && (
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <T p={`${base}.price`} style={{ fontFamily: ARCHIVO, fontSize: 54, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }} />
                  <T p="packages.period" style={{ fontSize: 14, color: "var(--muted)", letterSpacing: "0.08em" }} />
                </div>
              )}
              <div style={{ height: 1, background: "var(--line)" }} />
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 13 }}>
                {p.features.map((f, j) => (
                  <li
                    key={f.id}
                    {...a.item(`${base}.features.${j}`)}
                    style={{ display: "grid", gridTemplateColumns: "16px 1fr", gap: 12, fontSize: 15.5, lineHeight: 1.5, color: "var(--muted)" }}
                  >
                    <span style={{ color: "var(--accent)", fontSize: 13, lineHeight: 1.7 }}>●</span>
                    <T p={`${base}.features.${j}.text`} />
                  </li>
                ))}
              </ul>
              <a
                href="#contact"
                className="hv-invert-all"
                style={{ marginTop: "auto", textAlign: "center", padding: "15px 22px", borderRadius: 999, fontWeight: 600, fontSize: 14.5, background: p.featured ? "var(--accent)" : "transparent", color: p.featured ? "#fff" : "var(--text)", border: `1px solid ${border}` }}
              >
                <T p={`${base}.cta`} />
              </a>
            </article>
          );
        })}
      </div>
      <p style={{ margin: "26px 0 0", textAlign: "center", fontSize: 14.5, color: "var(--muted)" }}>
        <T p="packages.note" /> <L p="packages.noteLink" />
      </p>
    </section>
  );
}

/* --------------------------------------------------------------- praise */

function Praise() {
  const c = useContent();
  const a = useEditAttrs();
  const [q, setQ] = useState(0);
  const n = c.praise.quotes.length;
  const i = n ? ((q % n) + n) % n : 0;
  const arrow: CSSProperties = { width: 46, height: 46, borderRadius: "50%", border: "1px solid var(--line)", background: "transparent", cursor: "pointer", fontSize: 17 };
  return (
    <section id="praise" {...a.section("praise")} style={{ borderTop: "1px solid var(--line)", background: "var(--surface)", padding: `${SECTION_PAD} 0` }}>
      <div style={{ ...WRAP, display: "flex", flexDirection: "column", gap: 42 }}>
        <div style={{ display: "flex", alignItems: "end", justifyContent: "space-between", gap: 32, flexWrap: "wrap" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <T p="praise.eyebrow" style={eyebrow} />
            <T p="praise.title" as="h2" style={h2} />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button type="button" onClick={() => setQ(i - 1)} aria-label="Previous testimonial" className="hv-outline" style={arrow}>
              ←
            </button>
            <button type="button" onClick={() => setQ(i + 1)} aria-label="Next testimonial" className="hv-outline" style={arrow}>
              →
            </button>
          </div>
        </div>
        {n > 0 && (
          <blockquote key={c.praise.quotes[i].id} {...a.item(`praise.quotes.${i}`)} style={{ margin: 0, display: "flex", flexDirection: "column", gap: 28, maxWidth: 980 }}>
            <p style={{ margin: 0, fontFamily: ARCHIVO, fontSize: "clamp(24px, 3.1vw, 38px)", fontWeight: 600, lineHeight: 1.3, letterSpacing: "-0.02em" }}>
              “<T p={`praise.quotes.${i}.text`} />”
            </p>
            <footer style={{ display: "flex", alignItems: "center", gap: 14 }}>
              <span style={{ width: 40, height: 1, background: "var(--accent)" }} />
              <T p={`praise.quotes.${i}.name`} style={{ fontSize: 15, fontWeight: 600 }} />
              <T p={`praise.quotes.${i}.role`} style={{ fontSize: 15, color: "var(--muted)" }} />
            </footer>
          </blockquote>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          {c.praise.quotes.map((quote, d) => (
            <span key={quote.id} style={{ width: 30, height: 3, borderRadius: 2, background: d === i ? "var(--accent)" : "var(--line)" }} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- contact */

const label: CSSProperties = { display: "flex", flexDirection: "column", gap: 8, fontSize: 12.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" };
const field: CSSProperties = { background: "var(--bg)", border: "1px solid var(--line)", borderRadius: 12, padding: "14px 15px", fontSize: 16, letterSpacing: "normal", textTransform: "none", color: "var(--text)", outline: "none" };
const twoCol: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 18 };

function Contact() {
  const c = useContent();
  const a = useEditAttrs();
  const { editing } = useEdit();
  const [sent, setSent] = useState(false);
  const f = c.contact.form;

  const submit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (editing) return;
    const d = new FormData(e.currentTarget);
    const body =
      "Name: " + (d.get("name") || "") + "\nEmail: " + (d.get("email") || "") + "\nBusiness: " + (d.get("business") || "") + "\nPackage: " + (d.get("package") || "") + "\n\n" + (d.get("message") || "");
    window.location.href =
      "mailto:" + f.mailTo + "?subject=" + encodeURIComponent("New inquiry from " + (d.get("name") || "the website")) + "&body=" + encodeURIComponent(body);
    setSent(true);
  };

  return (
    <section id="contact" {...a.section("contact")} style={{ maxWidth: 1240, margin: "0 auto", padding: `${SECTION_PAD} clamp(18px, 5vw, 28px) 40px` }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "48px 60px", alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
          <T p="contact.eyebrow" style={eyebrow} />
          <T p="contact.title" as="h2" style={{ ...h2, fontSize: "clamp(34px, 4.6vw, 62px)", lineHeight: 1.0, letterSpacing: "-0.01em" }} />
          <T p="contact.body" as="p" style={{ margin: 0, fontSize: 17.5, lineHeight: 1.65, color: "var(--muted)", maxWidth: 440 }} />
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 6 }}>
            {c.contact.details.map((d, i) => {
              const inner = (
                <>
                  <T p={`contact.details.${i}.label`} style={{ fontSize: 12, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--muted)", width: 68 }} />
                  <T p={`contact.details.${i}.value`} />
                </>
              );
              const row: CSSProperties = { display: "flex", alignItems: "center", gap: 12, fontSize: 17 };
              return d.href ? (
                <a key={d.id} href={d.href} {...a.item(`contact.details.${i}`)} className="hv-accent" style={{ ...row, color: "var(--text)" }}>
                  {inner}
                </a>
              ) : (
                <div key={d.id} {...a.item(`contact.details.${i}`)} style={row}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
        <form onSubmit={submit} {...a.target("contact.form", "item")} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 24, padding: "clamp(22px, 4.5vw, 32px)", display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={twoCol}>
            <label style={label}>
              <T p="contact.form.nameLabel" />
              <input name="name" required placeholder={f.namePlaceholder} className="fc" style={field} />
            </label>
            <label style={label}>
              <T p="contact.form.emailLabel" />
              <input name="email" type="email" required placeholder={f.emailPlaceholder} className="fc" style={field} />
            </label>
          </div>
          <div style={twoCol}>
            <label style={label}>
              <T p="contact.form.businessLabel" />
              <input name="business" placeholder={f.businessPlaceholder} className="fc" style={field} />
            </label>
            <label style={label}>
              <T p="contact.form.packageLabel" />
              <select name="package" className="fc" style={field}>
                {f.packageOptions.map((o) => (
                  <option key={o.id}>{o.text}</option>
                ))}
              </select>
            </label>
          </div>
          <label style={label}>
            <T p="contact.form.messageLabel" />
            <textarea name="message" rows={5} required placeholder={f.messagePlaceholder} className="fc" style={{ ...field, lineHeight: 1.5, resize: "vertical" }} />
          </label>
          <button type="submit" className="hv-invert" style={{ background: "var(--accent)", color: "#fff", border: "none", borderRadius: 999, padding: "17px 26px", fontWeight: 600, fontSize: 15.5, cursor: "pointer" }}>
            <T p="contact.form.submit" />
          </button>
          <p style={{ margin: 0, fontSize: 13, color: "var(--muted)", textAlign: "center" }}>
            {sent ? f.sentNote : <T p="contact.form.note" />}
          </p>
        </form>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- footer */

function Footer() {
  const c = useContent();
  const a = useEditAttrs();
  return (
    <footer {...a.section("footer")} style={{ borderTop: "1px solid var(--line)", marginTop: 56 }}>
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "36px clamp(18px, 5vw, 28px)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 26, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Img p="brand.logo" alt="" style={{ width: 38, height: 38, objectFit: "contain", filter: "var(--logo-filter)", mixBlendMode: "var(--logo-blend)" as CSSProperties["mixBlendMode"] }} />
          <T p="brand.name" style={{ fontFamily: ARCHIVO, fontSize: 16.5, fontWeight: 600, letterSpacing: "0.01em" }} />
        </div>
        <div style={{ display: "flex", gap: 24, fontSize: 14 }}>
          {c.footer.links.map((l, i) => (
            <L key={l.id} p={`footer.links.${i}`} {...a.item(`footer.links.${i}`)} className="hv-text" style={{ color: "var(--muted)" }} />
          ))}
        </div>
        {c.footer.socials.length > 0 && (
          <nav aria-label={`Follow ${c.brand.name}`} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {c.footer.socials.map((s, i) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${c.brand.name} on ${SOCIAL_NAMES[s.platform]}`}
                title={SOCIAL_NAMES[s.platform]}
                {...a.item(`footer.socials.${i}`)}
                className="hv-social"
                style={{ width: 42, height: 42, display: "grid", placeItems: "center", border: "1px solid var(--line)", borderRadius: "50%", background: "var(--surface)", color: "var(--text)" }}
              >
                <SocialIcon platform={s.platform} />
              </a>
            ))}
          </nav>
        )}
        <T p="footer.copyright" style={{ fontSize: 13.5, color: "var(--muted)" }} />
      </div>
    </footer>
  );
}

const SOCIAL_NAMES = { facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube", linkedin: "LinkedIn", x: "X" } as const;
