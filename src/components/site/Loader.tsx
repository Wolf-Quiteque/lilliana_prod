"use client";

import { useEffect, useRef, useState } from "react";
import type { SiteContent } from "@/lib/content/types";

// The "on set" intro loader from the original site: a 9:16 reel frame with REC timecode, spinning
// aperture and a scrub bar. It is server-rendered so it covers the first paint, then runs a short
// progress sweep while fonts and above-the-fold images settle.

const MIN_MS = 900;
const MAX_MS = 3500;

export function Loader({ loader }: { loader: SiteContent["loader"] }) {
  const [gone, setGone] = useState(false);
  const [pct, setPct] = useState(0);
  const [status, setStatus] = useState(loader.status);
  const [done, setDone] = useState(false);
  const tcRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const start = performance.now();
    const pad = (n: number) => (n < 10 ? "0" : "") + n;
    const tick = setInterval(() => {
      const ms = performance.now() - start;
      if (tcRef.current) {
        tcRef.current.textContent = `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}:${Math.floor(ms / 100) % 10}`;
      }
      setPct((p) => Math.min(0.92, p + (0.92 - p) * 0.12));
    }, 100);

    let cancelled = false;
    const ready = Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      new Promise((r) => setTimeout(r, MIN_MS)),
    ]);
    Promise.race([ready, new Promise((r) => setTimeout(r, MAX_MS))]).then(() => {
      if (cancelled) return;
      clearInterval(tick);
      setPct(1);
      setStatus(loader.done);
      setDone(true);
      setTimeout(() => !cancelled && setGone(true), 520);
    });
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
  }, [loader.done]);

  if (gone) return null;
  const words = loader.words.map((w) => w.text.toUpperCase());
  const half = (
    <span className="__lp_half">
      {words.map((w, i) => (
        <span key={i}>
          {w}
          <b className="__lp_mq_dot">●{i === words.length - 1 ? " " : ""}</b>
        </span>
      ))}
    </span>
  );

  return (
    <div id="lp-loader" role="status" aria-live="polite" aria-label={status} className={done ? "__lp_done" : undefined} style={done ? { opacity: 0 } : undefined}>
      <div className="__lp_glow" />
      <div className="__lp_grain" />
      <div className="__lp_frame">
        <div className="__lp_frame_top">
          <span className="__lp_dot" />
          <span className="__lp_rec">REC</span>
          <span className="__lp_tc" ref={tcRef}>
            00:00:00:00
          </span>
        </div>
        <div className="__lp_lens">
          <div className="__lp_a1" />
          <div className="__lp_a2" />
          <div className="__lp_a3" />
          <div className="__lp_mono">LP</div>
        </div>
        <div className="__lp_scrub">
          <div className="__lp_scrub_track">
            <span className="__lp_scrub_fill" style={{ width: `${(pct * 100).toFixed(1)}%` }} />
            <span className="__lp_scrub_thumb" style={{ left: `${(pct * 100).toFixed(1)}%` }} />
          </div>
        </div>
      </div>
      <div className="__lp_marquee">
        <div className="__lp_marquee_inner">
          {half}
          {half}
        </div>
      </div>
      <div className="__lp_status_row">
        <span className="__lp_status_text">{status}</span>
        <span className="__lp_pct">{Math.round(pct * 100)}%</span>
      </div>
      <div className="__lp_brand" style={{ whiteSpace: "pre" }}>
        {loader.brand.toUpperCase()}
      </div>
    </div>
  );
}
