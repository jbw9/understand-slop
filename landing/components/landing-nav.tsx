"use client";

import { useEffect, useRef, useState } from "react";
import s from "./landing.module.css";
import { ThemeToggle } from "./landing-theme";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#start", label: "Your repo" },
  { href: "#questions", label: "Questions" },
];

/** The bar across the top, which pulls in to a floating pill once the page scrolls. */
export function LandingNav({ github }: { github: string }) {
  const bar = useRef<HTMLElement>(null);
  const [floating, setFloating] = useState(false);
  useEffect(() => {
    // The page scrolls itself, not the window: the layout locks the body.
    const page = bar.current!.parentElement!;
    const on = () => setFloating(page.scrollTop > 24);
    on();
    page.addEventListener("scroll", on, { passive: true });
    return () => page.removeEventListener("scroll", on);
  }, []);

  return (
    <header ref={bar} className={s.nav} data-float={floating}>
      <div className={s.navBar}>
        <a
          className={s.mark}
          href="#"
          onClick={(e) => {
            // "#" scrolls the window, and the window never scrolls here.
            e.preventDefault();
            bar.current!.parentElement!.scrollTo({ top: 0 });
          }}
        >
          Mira
        </a>
        <nav aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <a href={github}>GitHub</a>
        </nav>
        <ThemeToggle />
        {/* No build to link yet. */}
        <a className={`${s.btn} ${s.primary} ${s.navCta}`} href="#">
          Download
        </a>
      </div>
    </header>
  );
}
