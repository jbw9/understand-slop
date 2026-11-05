"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import { ThemeToggle } from "./landing-theme";

const LINKS = [
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
  { href: "#start", label: "Get it" },
];

/** Where the reader is: the section, and the part of it, whose top has passed under the bar. */
function trailOf(page: HTMLElement) {
  const line = page.getBoundingClientRect().top + 96;
  let section: HTMLElement | undefined;
  for (const el of page.querySelectorAll<HTMLElement>("[data-trail]")) if (el.getBoundingClientRect().top <= line) section = el;
  let part: HTMLElement | undefined;
  for (const el of section?.querySelectorAll<HTMLElement>("[data-part]") ?? []) if (el.getBoundingClientRect().top <= line) part = el;
  return [section?.dataset.trail, part?.dataset.part].filter(Boolean) as string[];
}

type Entry = { id: string; title: string; under?: string };

/** Every section and part on the page, in order, for the jump list. */
const entries = (page: HTMLElement): Entry[] =>
  [...page.querySelectorAll<HTMLElement>("[data-trail], [data-part]")].map((el) =>
    el.dataset.trail
      ? { id: el.id, title: el.dataset.trail }
      : { id: el.id, title: el.dataset.part!, under: el.closest<HTMLElement>("[data-trail]")?.dataset.trail },
  );

/**
 * The app's own title bar: the mark, the trail of where you are, and the
 * box that jumps anywhere. The page scrolls itself, not the window: the layout
 * locks the body.
 */
export function LandingNav({ github }: { github: string }) {
  const bar = useRef<HTMLElement>(null);
  const [trail, setTrail] = useState<string[]>([]);
  // The page the jump list searches, set when it opens; null while it is closed.
  const [jumping, setJumping] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const page = bar.current!.parentElement!;
    let frame = 0;
    const on = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = trailOf(page);
        setTrail((t) => (t.join("›") === next.join("›") ? t : next));
      });
    };
    on();
    page.addEventListener("scroll", on, { passive: true });
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setJumping((j) => (j ? null : page));
      }
    };
    window.addEventListener("keydown", key);
    return () => {
      page.removeEventListener("scroll", on);
      window.removeEventListener("keydown", key);
    };
  }, []);

  const top = () => bar.current!.parentElement!.scrollTo({ top: 0 });

  return (
    <header ref={bar} className={s.nav}>
      <a
        className={s.mark}
        href="#"
        onClick={(e) => {
          // "#" scrolls the window, and the window never scrolls here.
          e.preventDefault();
          top();
        }}
      >
        <MiraMark />
        Mira
      </a>
      <ol className={s.trail} aria-label="You are here">
        {(trail.length ? trail : ["Overview"]).map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <nav aria-label="Sections" className={s.links}>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
        <a href={github}>GitHub</a>
      </nav>
      <button className={s.jump} onClick={() => setJumping(bar.current!.parentElement!)} aria-haspopup="dialog">
        <span>Jump to…</span>
        <kbd>⌘K</kbd>
      </button>
      <ThemeToggle />
      {/* No build to link yet. */}
      <a className={`${s.btn} ${s.ink} ${s.navCta}`} href="#">
        Download
      </a>
      {jumping ? <Jump page={jumping} close={() => setJumping(null)} /> : null}
    </header>
  );
}

/** The app's palette, on the page: type to find a section, Enter to go there. */
function Jump({ page, close }: { page: HTMLElement; close: () => void }) {
  const [q, setQ] = useState("");
  const [at, setAt] = useState(0);
  const [all] = useState(() => entries(page));
  const shown = all.filter((e) => `${e.title} ${e.under ?? ""}`.toLowerCase().includes(q.trim().toLowerCase()));
  const go = (e: Entry | undefined) => {
    if (!e) return;
    close();
    page.querySelector(`#${CSS.escape(e.id)}`)?.scrollIntoView({ block: "start" });
  };

  return (
    <div className={s.veil} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={s.palette} role="dialog" aria-modal="true" aria-label="Jump to a section">
        <input
          autoFocus
          value={q}
          placeholder="Jump to a section"
          aria-controls="jump-list"
          aria-activedescendant={shown[at] ? `jump-${shown[at].id}` : undefined}
          onChange={(e) => {
            setQ(e.target.value);
            setAt(0);
          }}
          onKeyDown={(e) => {
            const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
            if (e.key in moves) {
              e.preventDefault();
              setAt((a) => Math.max(0, Math.min(shown.length - 1, a + moves[e.key])));
            } else if (e.key === "Enter") go(shown[at]);
            else if (e.key === "Escape") {
              // Kept from the demo, which hands Esc to the map it frames.
              e.preventDefault();
              close();
            }
          }}
        />
        <ul id="jump-list" role="listbox">
          {shown.map((e, i) => (
            <li
              key={e.id}
              id={`jump-${e.id}`}
              role="option"
              aria-selected={i === at}
              onMouseEnter={() => setAt(i)}
              onClick={() => go(e)}
            >
              {e.under ? <span>{e.under}</span> : null}
              {e.title}
            </li>
          ))}
          {shown.length ? null : <li className={s.none}>No section is called that.</li>}
        </ul>
      </div>
    </div>
  );
}

/** Three cards and the wires between them: a map, drawn small. */
export function MiraMark() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden className={s.markIcon}>
      <rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1.5" fill="currentColor" />
      <rect x="9" y="1.5" width="5.5" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <rect x="9" y="9" width="5.5" height="5.5" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.3" />
      <path d="M7 4.25h2M11.75 7v2" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
