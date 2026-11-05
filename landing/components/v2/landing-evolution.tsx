"use client";
/* eslint-disable @next/next/no-img-element -- the site is a static export, which next/image cannot optimize; these are small dithered PNGs already. */

import { useEffect, useRef } from "react";
import s from "./v2.module.css";

const img = (name: string) => `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/v2/${name}.png`;

// Where each stop sits on the line, in the drawing's own units (1000 wide, H tall).
const H = 1250;
const STOPS = [
  { x: 270, y: 250, pic: "tl-ada", who: "Ada Lovelace", year: "1843", did: "Wrote what is often called the first program, for a machine that was never built.", tilt: -2 },
  { x: 730, y: 600, pic: "tl-turing", who: "Alan Turing", year: "1936", did: "Described a machine that could run any program written as steps.", tilt: 1.5 },
  { x: 270, y: 950, pic: "tl-karpathy", who: "Andrej Karpathy", year: "2025", did: "Named vibe coding: you “fully give in to the vibes” and “forget that the code even exists.”", tilt: -1 },
];

const PATH = "M500 0C500 125 270 125 270 250S730 460 730 600 270 810 270 950 500 1150 500 1250";

/**
 * How we got here: one line drawn down the page as it scrolls, through three
 * people, from code read by hand to code nobody reads, and on into the app below.
 */
export function LandingEvolution() {
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = box.current!;
    // The page scrolls itself, not the window.
    const page = el.closest<HTMLElement>(`.${s.page}`)!;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const field = el.querySelector<HTMLElement>(`.${s.evoField}`)!;
    const on = () => {
      const r = field.getBoundingClientRect();
      // The line's tip follows the middle of the screen.
      const p = still ? 1 : Math.min(1, Math.max(0, (innerHeight * 0.6 - r.top) / r.height));
      el.style.setProperty("--p", String(p));
      el.querySelectorAll<HTMLElement>("[data-at]").forEach((n) => (n.dataset.on = String(p >= Number(n.dataset.at) - 0.04)));
    };
    on();
    page.addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => {
      page.removeEventListener("scroll", on);
      removeEventListener("resize", on);
    };
  }, []);

  const at = (x: number, y: number) => ({ left: `${x / 10}%`, top: `${(y / H) * 100}%` });

  return (
    <section ref={box} className={s.evo} aria-labelledby="evo-title">
      <p className={s.bracket}>[ How we got here ]</p>
      <h2 id="evo-title">People used to read every line.</h2>
      <div className={s.evoField}>
        <svg className={s.evoLine} viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden>
          <path d={PATH} className={s.evoGhost} />
        </svg>
        {/* The ink is the same line, clipped to how far the reader has scrolled. */}
        <svg className={`${s.evoLine} ${s.evoInk}`} viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" aria-hidden>
          <path d={PATH} />
        </svg>
        {STOPS.map((st) => (
          <figure
            key={st.who}
            className={s.stop}
            data-side={st.x < 500 ? "left" : "right"}
            data-at={st.y / H}
            style={{ ...at(st.x, st.y), "--tilt": `${st.tilt}deg` } as React.CSSProperties}
          >
            <img src={img(st.pic)} alt={st.who} loading="lazy" />
            <figcaption>
              <span className={s.stopYear}>{st.year}</span>
              <b>{st.who}</b>
              <span>{st.did}</span>
            </figcaption>
          </figure>
        ))}
      </div>
    </section>
  );
}
