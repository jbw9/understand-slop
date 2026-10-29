"use client";

import { useSyncExternalStore } from "react";
import { SETTINGS_KEY } from "../../app/lib/theme";
import s from "./landing.module.css";

/** Light and dark, in the bar across the top. The demo's frame follows <html>, so it changes too. */
export function ThemeToggle() {
  const theme = useSyncExternalStore(onTheme, readTheme, () => null);

  // Saved where the app keeps its own choice, so the frame, and every map opened in it later, follows.
  const pick = (t: "light" | "dark") => {
    const apply = () => {
      document.documentElement.dataset.theme = t;
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"), theme: t }));
    } catch {}
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(apply);
    } else apply();
  };

  return (
    <div className={`${s.mode} ${s.navMode}`} role="group" aria-label="Theme">
      <button aria-pressed={theme === "light"} aria-label="Light" title="Light" onClick={() => pick("light")}>
        <svg viewBox="0 0 16 16" aria-hidden>
          <circle cx="8" cy="8" r="2.75" />
          <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
        </svg>
      </button>
      <button aria-pressed={theme === "dark"} aria-label="Dark" title="Dark" onClick={() => pick("dark")}>
        <svg viewBox="0 0 16 16" aria-hidden>
          <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z" />
        </svg>
      </button>
    </div>
  );
}

// The theme is set on <html> before React loads, so the server can't know it.
export const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
export const onTheme = (f: () => void) => {
  const o = new MutationObserver(f);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
};
