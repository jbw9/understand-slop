"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/**
 * Magnifying the open level: pinch, ⌘/Ctrl-scroll, or ⌘ +/−/0.
 *
 * Page zoom (CSS `zoom`, the browser's own) reflows, and the diagrams already
 * fill the page width, so reflowing would leave them exactly the size they
 * were. This magnifies instead: the level keeps the layout it has at 100% and
 * grows past the window, to be scrolled around. A transform rather than CSS
 * `zoom` because getBoundingClientRect then means the same thing in Chrome
 * and WebKit (the wires measure with it); text and SVG are re-rasterised at
 * the new scale, so nothing goes soft.
 */

const MIN = 1;
const MAX = 4;
const STEPS = [1, 1.25, 1.5, 2, 2.5, 3, 4];

const Scale = createContext(1);

/** The magnification the level is drawn at, for anything that measures it. */
export const useZoomScale = () => useContext(Scale);

export function Zoom({ scrollRef, children }: { scrollRef: RefObject<HTMLElement | null>; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const now = useRef(1);
  const [zoom, setZoom] = useState(1);

  // Applied straight to the DOM, not through a render: a pinch delivers
  // several events a frame, and each one anchors on the scroll position the
  // last one left. Only the context re-renders — `children` are the same
  // elements, so the level itself does not.
  const zoomTo = useRef((next: number, at?: { x: number; y: number }) => {
    const pane = scrollRef.current;
    const box = ref.current;
    if (!pane || !box) return;
    const z = Math.min(MAX, Math.max(MIN, next));
    const from = now.current;
    if (Math.abs(z - from) < 0.001) return;
    const p = at ?? { x: pane.clientWidth / 2, y: pane.clientHeight / 2 };
    // The point under the cursor, in unscaled level coordinates, stays put.
    const top = box.offsetTop;
    const cx = (pane.scrollLeft + p.x) / from;
    const cy = (pane.scrollTop + p.y - top) / from;
    now.current = z;
    fit(box, pane, z);
    pane.scrollLeft = cx * z - p.x;
    pane.scrollTop = cy * z + top - p.y;
    setZoom(z);
  }).current;

  const step = (dir: 1 | -1) =>
    zoomTo(
      dir > 0
        ? (STEPS.find((s) => s > now.current + 0.01) ?? MAX)
        : ([...STEPS].reverse().find((s) => s < now.current - 0.01) ?? MIN),
    );

  useEffect(() => {
    const pane = scrollRef.current;
    const box = ref.current;
    if (!pane || !box) return;
    const local = (e: { clientX: number; clientY: number }) => {
      const r = pane.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };

    // Chrome reports a trackpad pinch as a ctrl-wheel; WebKit (the desktop
    // app) as gesture events, and may send both — so a wheel during a gesture
    // is the same pinch twice.
    let pinching = false;
    let from = 1;
    const onWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || pinching) return;
      e.preventDefault();
      const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomTo(now.current * Math.exp(-Math.max(-25, Math.min(25, dy)) * 0.01), local(e));
    };
    type Gesture = Event & { scale: number; clientX: number; clientY: number };
    const onStart = (e: Event) => {
      e.preventDefault();
      pinching = true;
      from = now.current;
    };
    const onChange = (e: Event) => {
      e.preventDefault();
      zoomTo(from * (e as Gesture).scale, local(e as Gesture));
    };
    const onEnd = (e: Event) => {
      e.preventDefault();
      pinching = false;
    };

    const onKey = (e: KeyboardEvent) => {
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      if (!mod || e.altKey) return;
      // The terminal has its own font zoom on the same keys.
      if ((e.target as Element | null)?.closest?.(".xterm, input, textarea, [contenteditable]")) return;
      if (e.code === "Equal" || e.code === "NumpadAdd") step(1);
      else if (e.code === "Minus" || e.code === "NumpadSubtract") step(-1);
      else if (e.code === "Digit0" || e.code === "Numpad0") zoomTo(1);
      else return;
      e.preventDefault();
    };

    // The level's width is pinned to the pane's while magnified; follow the window.
    const ro = new ResizeObserver(() => fit(box, pane, now.current));
    ro.observe(pane);

    pane.addEventListener("wheel", onWheel, { passive: false });
    pane.addEventListener("gesturestart", onStart);
    pane.addEventListener("gesturechange", onChange);
    pane.addEventListener("gestureend", onEnd);
    window.addEventListener("keydown", onKey);
    return () => {
      ro.disconnect();
      pane.removeEventListener("wheel", onWheel);
      pane.removeEventListener("gesturestart", onStart);
      pane.removeEventListener("gesturechange", onChange);
      pane.removeEventListener("gestureend", onEnd);
      window.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scrollRef]);

  return (
    <Scale.Provider value={zoom}>
      <div ref={ref}>{children}</div>
      {zoom === 1 ? null : (
        <div className="fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center overflow-hidden rounded-full border border-border-gray bg-pure-white text-[12.5px] text-ink shadow-lift">
          <button
            type="button"
            aria-label="Zoom out"
            onClick={() => step(-1)}
            className="cursor-pointer px-3 py-1 hover:bg-surface-container-low"
          >
            −
          </button>
          <button
            type="button"
            title="Back to 100% (⌘0)"
            onClick={() => zoomTo(1)}
            className="tnum min-w-[52px] cursor-pointer py-1 text-center hover:bg-surface-container-low"
          >
            {Math.round(zoom * 100)}%
          </button>
          <button
            type="button"
            aria-label="Zoom in"
            onClick={() => step(1)}
            className="cursor-pointer px-3 py-1 hover:bg-surface-container-low"
          >
            +
          </button>
        </div>
      )}
    </Scale.Provider>
  );
}

/** At 100% nothing is set, so the level lays out exactly as it always has. */
function fit(box: HTMLElement, pane: HTMLElement, z: number) {
  box.style.width = z === 1 ? "" : `${pane.clientWidth}px`;
  box.style.transform = z === 1 ? "" : `scale(${z})`;
  box.style.transformOrigin = z === 1 ? "" : "0 0";
}
