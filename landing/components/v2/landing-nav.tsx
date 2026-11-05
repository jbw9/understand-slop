"use client";

import { useEffect, useRef, useState } from "react";
import s from "./v2.module.css";

const LINKS = [
  { href: "#why", label: "Why" },
  { href: "#how", label: "How it works" },
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
          <Logo />
          Bluprint
        </a>
        <nav aria-label="Sections">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ))}
          <a href={github}>GitHub</a>
        </nav>
        <a className={`${s.btn} ${s.primary} ${s.navCta}`} href="#install">
          Install
        </a>
      </div>
    </header>
  );
}

/** The app icon's drawing: a head peeking over a sheet of code. */
function Logo() {
  return (
    <svg className={s.markLogo} viewBox="140 320 744 530" aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="26" strokeLinecap="round" strokeLinejoin="round">
        <path d="M334 562C332 446 414 346 514 346C612 346 694 444 690 560" />
        <path d="M200 562c0-56 48-56 48 0c0-56 48-56 48 0M728 562c0-56 48-56 48 0c0-56 48-56 48 0" />
        <path d="M160 566C360 558 660 570 864 562" />
        <path d="M268 656H532M580 656H664M332 740H716M332 824H464M512 824H588" />
      </g>
      <ellipse cx="460" cy="474" rx="16" ry="24" />
      <ellipse cx="570" cy="474" rx="16" ry="24" />
      <g className={s.blush}>
        <ellipse cx="412" cy="524" rx="29" ry="16" />
        <ellipse cx="620" cy="524" rx="29" ry="16" />
      </g>
    </svg>
  );
}
