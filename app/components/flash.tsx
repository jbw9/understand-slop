"use client";

import { useEffect } from "react";
import { useMap } from "@/components/map-context";

const LIT_MS = 2000;

/**
 * Lights what a rewrite of the map just changed, where it is on screen: a row
 * or a list entry (`data-path`), or a box on the level's picture that opens a
 * changed part (`data-opens`, components/blocks.tsx). A change deep in the
 * tree lights the row that leads to it, since its ancestors differ too
 * (lib/share.ts). The level's own header lights only when nothing on it did,
 * which is when the change is the level's own text. Once per rewrite: walking
 * to a level later shows it as it is, unlit.
 */
export function useFlash(content: React.RefObject<HTMLElement | null>) {
  const { fresh } = useMap();

  useEffect(() => {
    const root = content.current;
    if (!fresh.at || !root) return;
    const css = getComputedStyle(document.documentElement);
    const ring = css.getPropertyValue("--color-deep-green").trim();
    const wash = css.getPropertyValue("--color-mint-success").trim();
    // The open level, as its header names it; read when a rewrite lands,
    // not followed, since moving on is not a change.
    const header = root.querySelector<HTMLElement>("header[data-path]");
    const here = header?.dataset.path ?? "[]";
    const lit: Element[] = [];

    for (const el of root.querySelectorAll<HTMLElement>("[data-path]"))
      if (el !== header && fresh.paths.has(el.dataset.path!)) lit.push(el);
    const at: string[] = JSON.parse(here);
    for (const el of root.querySelectorAll<SVGElement>("[data-opens]")) {
      const rect = el.querySelector("rect");
      if (rect && fresh.paths.has(JSON.stringify([...at, el.dataset.opens]))) lit.push(rect);
    }
    if (!lit.length && header && fresh.paths.has(here)) lit.push(header);

    const timing = { duration: LIT_MS, easing: "ease-out" };
    for (const el of lit) {
      const now = getComputedStyle(el);
      if (el instanceof SVGElement)
        el.animate(
          [
            { stroke: ring, strokeWidth: "3", strokeOpacity: "1" },
            { stroke: now.stroke, strokeWidth: now.strokeWidth, strokeOpacity: now.strokeOpacity },
          ],
          timing,
        );
      else
        el.animate(
          [
            { boxShadow: `0 0 0 2px ${ring}`, backgroundColor: wash },
            { boxShadow: "0 0 0 2px transparent", backgroundColor: now.backgroundColor },
          ],
          timing,
        );
    }
  }, [fresh, content]);
}
