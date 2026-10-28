"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { SETTINGS_KEY } from "../../app/lib/theme";
import s from "./landing.module.css";

export interface DemoMap {
  id: string;
  label: string;
  files: number;
  /** The commit the map describes. */
  commit: string;
}

// Built, each map's own export beside this page; in dev, the live app on this origin (next.config.ts).
const src = (id: string) => (process.env.NODE_ENV === "production" ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${id}/` : `/?map=${id}&embed`);

/**
 * The real canvas, framed. Each tab points the frame at another committed
 * map, so what a visitor explores is the product itself, not a recording. The
 * page is static and has no server to read maps, so each tab opens that map's
 * own export, published beside it. A guided tour starts on the first map
 * and points at the real cards inside the frame.
 */
export function LandingDemo({ maps }: { maps: DemoMap[] }) {
  const [open, setOpen] = useState(maps[0].id);
  const [loaded, setLoaded] = useState<string | null>(null);
  const current = maps.find((m) => m.id === open)!;
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const tabs = useRef<HTMLDivElement>(null);
  const replay = useRef<HTMLButtonElement>(null);
  const guide = useRef<Tour>(null);
  const shownMap = useRef(open);
  const theme = useSyncExternalStore(onTheme, readTheme, () => null);

  // Saved where the app keeps its own choice, so the frame, and every map opened in it later, follows.
  const pick = (t: "light" | "dark") => {
    const apply = () => {
      document.documentElement.dataset.theme = t;
      try {
        frame.current!.contentDocument!.documentElement.dataset.theme = t;
      } catch {}
    };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"), theme: t }));
    } catch {}
    if (document.startViewTransition && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.startViewTransition(apply);
    } else apply();
  };

  // The first frame is server-rendered and can finish loading before React
  // hydrates, so its load event is missed. Read the document instead.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") setLoaded(open);
  }, [open]);

  // Another repository ends the tour, whether picked by click or by arrow key.
  useEffect(() => {
    if (shownMap.current === open) return;
    shownMap.current = open;
    guide.current?.away();
  }, [open]);

  // Keys go only to the focused document, so Esc pressed on the page around
  // the demo never reached the map. Hand it on while the demo is on screen.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest("input, textarea, [contenteditable]")) return;
      const r = stage.current!.getBoundingClientRect();
      if (r.bottom <= 0 || r.top >= window.innerHeight) return;
      try {
        const win = frame.current!.contentWindow as typeof window;
        win.document.body.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
      } catch {}
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const t = tour(frame.current!, stage.current!, replay.current!);
    guide.current = t;
    return t.dispose;
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    const i = maps.findIndex((m) => m.id === open);
    const next = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: maps.length - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = maps[(next + maps.length) % maps.length].id;
    setOpen(id);
    tabs.current!.querySelector<HTMLElement>(`[data-id="${id}"]`)!.focus();
  };

  return (
    <>
      <div className={`${s.switcher} ${s.rise}`} style={{ "--i": 3 } as React.CSSProperties}>
        <div ref={tabs} role="tablist" aria-label="Repository" className={s.tabs} onKeyDown={onKey}>
          {maps.map((m) => (
            <button
              key={m.id}
              role="tab"
              data-id={m.id}
              aria-selected={m.id === open}
              tabIndex={m.id === open ? 0 : -1}
              onClick={() => setOpen(m.id)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div className={`${s.frame} ${s.rise}`} style={{ "--i": 4 } as React.CSSProperties}>
        <div className={s.canvas}>
          <div className={s.bar}>
            <div aria-hidden className={s.lights}>
              <span />
              <span />
              <span />
            </div>
            <span className={s.meta}>
              {current.files.toLocaleString("en-US")} files · {current.commit}
            </span>
          </div>
          <div ref={stage} className={s.stage} data-ready={loaded === open}>
            {loaded !== open ? <p className={s.loading}>loading {current.id}…</p> : null}
            <iframe ref={frame} src={src(open)} title={`${current.label}, explored`} onLoad={() => setLoaded(open)} />
            <div className={s.tour} data-tour hidden>
              <div className={s.ring} data-ring aria-hidden hidden />
              <div className={s.tip} data-tip role="status" aria-live="polite" hidden>
                <p data-text />
                <div className={s.foot}>
                  <span data-count />
                  <button data-end>Skip tour</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className={s.under}>
        <div className={s.controls}>
          <div className={s.mode} role="group" aria-label="Theme">
            <button aria-pressed={theme === "light"} onClick={() => pick("light")}>
              <svg viewBox="0 0 16 16" aria-hidden>
                <circle cx="8" cy="8" r="2.75" />
                <path d="M8 1.5v1.25M8 13.25v1.25M1.5 8h1.25M13.25 8h1.25M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9" />
              </svg>
              Light
            </button>
            <button aria-pressed={theme === "dark"} onClick={() => pick("dark")}>
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M13.25 9.6A5.5 5.5 0 0 1 6.4 2.75a5.5 5.5 0 1 0 6.85 6.85z" />
              </svg>
              Dark
            </button>
          </div>
          {/* The tour shows and hides this, and the bubble in the frame, itself. */}
          <button ref={replay} className={`${s.btn} ${s.ghost} ${s.replay}`} hidden>
            Give me a tour
          </button>
        </div>
        <p className={s.cap}>
          This is the app, running on maps of real repositories. Click a step to open it, and press <kbd>Esc</kbd> to go
          back.
        </p>
      </div>
    </>
  );
}

// The theme is set on <html> before React loads, so the server can't know it.
const readTheme = () => (document.documentElement.dataset.theme === "dark" ? "dark" : "light");
const onTheme = (f: () => void) => {
  const o = new MutationObserver(f);
  o.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => o.disconnect();
};

type Step = { text: string; find: (d: Document) => Element | undefined };

const STEPS: Step[] = [
  { text: "Each card is one step the program takes. Click one to open it.", find: (d) => openable(d, 1) },
  { text: "These are that step's parts. Click one to see what it does.", find: (d) => openable(d, 2) },
  { text: "A part cites the code it describes. Click to see where.", find: (d) => drawers(d)[0] },
  { text: "Each row is a place in the code. Click one to read its lines.", find: (d) => refs(d)[0] },
  {
    text: "These are the exact lines. Press <kbd>Esc</kbd> to close them.",
    find: (d) => refs(d).find(isOpen)?.parentElement ?? undefined,
  },
];

const visible = (d: Document, sel: string) => [...d.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetWidth);
const openable = (d: Document, depth: number) =>
  visible(d, "button[data-path]:not([disabled])").find((b) => JSON.parse(b.dataset.path!).length === depth);
const isOpen = (b: Element) => b.getAttribute("aria-expanded") === "true";
/** The buttons that fold the code drawer: one on the level's header, and one above the drawer once it's open. */
const drawers = (d: Document) => visible(d, "button").filter((b) => /(View|Hide) the code/.test(b.textContent ?? ""));
/** The code drawer's rows, one per place in the code, each naming its `file:line`. */
const refs = (d: Document) =>
  visible(d, "button[aria-expanded]").filter((b) => /:\d+(–\d+)?/.test(b.textContent ?? "") && !b.closest("header"));

/**
 * Where the visitor is decides the step, not which click they were asked
 * for: going off script, or back up, shows the step for where they are.
 */
function stepOf(d: Document) {
  if (refs(d).some(isOpen)) return 4;
  if (drawers(d).some(isOpen)) return 3;
  return Math.min(new URLSearchParams(d.defaultView!.location.search).getAll("at").length, 2);
}

/**
 * Scrolls `el` inside its own scroller in the frame, never the page around it,
 * and returns that scroller. Centering never pushes the top of a tall element
 * out of view.
 */
function within(el: Element, align: "start" | "center", behavior: ScrollBehavior) {
  const view = el.ownerDocument.defaultView!;
  const r = el.getBoundingClientRect();
  let box: Element | null = null;
  for (let p = el.parentElement; p && !box; p = p.parentElement) {
    if (/(auto|scroll)/.test(view.getComputedStyle(p).overflowY) && p.scrollHeight > p.clientHeight) box = p;
  }
  const top = box ? box.getBoundingClientRect().top : 0;
  const h = box ? box.clientHeight : view.innerHeight;
  const margin = parseFloat(view.getComputedStyle(el).scrollMarginTop) || 0;
  const head = r.top - top - margin;
  const by = align === "start" ? head : Math.min(r.top - top - h / 2 + r.height / 2, head - 24);
  (box ?? view).scrollBy({ top: by, behavior });
  return box ?? view;
}

/**
 * The canvas scrolls cards into view with scrollIntoView, which also scrolls
 * every scroller around the frame: the landing page would jump to the demo.
 * Inside the frame, it scrolls only the frame's own scrollers.
 */
function contain(d: Document) {
  const proto = d.defaultView!.Element.prototype as { scrollIntoView: Element["scrollIntoView"] & { contained?: true } };
  if (proto.scrollIntoView.contained) return;
  const patched = function (this: Element, o?: boolean | ScrollIntoViewOptions) {
    const opts = typeof o === "object" ? o : undefined;
    within(this, opts?.block === "center" ? "center" : "start", opts?.behavior ?? "auto");
  };
  proto.scrollIntoView = Object.assign(patched, { contained: true as const });
}

type Box = { x: number; y: number; w: number; h: number };
type Tour = { away: () => void; dispose: () => void };

const GLIDE = 320;
const ease = (p: number) => 1 - (1 - p) ** 4;

/**
 * Puts an element on a box that may itself be moving. A glide eases from
 * where the element was toward the box's live position, so it lands exactly
 * on a target that scrolls while it travels. Otherwise it follows the box
 * every frame, with no lag.
 */
function mover(el: HTMLElement, sized: boolean) {
  let last: Box | null = null;
  let from: Box | null = null;
  let start = 0;
  let written = "";
  return {
    glide(now: number) {
      from = last;
      start = now;
    },
    forget() {
      last = from = null;
    },
    to(goal: Box, now: number) {
      let b = goal;
      if (from) {
        const p = Math.min(1, (now - start) / GLIDE);
        const e = ease(p);
        const f = from;
        b = { x: f.x + (goal.x - f.x) * e, y: f.y + (goal.y - f.y) * e, w: f.w + (goal.w - f.w) * e, h: f.h + (goal.h - f.h) * e };
        if (p === 1) from = null;
      }
      last = b;
      const x = Math.round(b.x);
      const y = Math.round(b.y);
      const w = Math.round(b.w);
      const h = Math.round(b.h);
      const key = sized ? `${x} ${y} ${w} ${h}` : `${x} ${y}`;
      if (key === written) return;
      written = key;
      el.style.transform = `translate(${x}px, ${y}px)`;
      if (sized) {
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
      }
    },
  };
}

/**
 * Where the tip goes: beside the target, then above it, then below it. When
 * none of those fit, it docks to the edge of the stage away from the target.
 */
function spot(r: DOMRect | undefined, W: number, H: number, tw: number, th: number) {
  const m = 12;
  const clampX = (x: number) => Math.max(m, Math.min(x, W - tw - m));
  const clampY = (y: number) => Math.max(m, Math.min(y, H - th - m));
  if (!r) return { side: "none", x: (W - tw) / 2, y: H - th - 28 };
  if (r.right + 18 + tw <= W - m) return { side: "right", x: r.right + 18, y: clampY(r.top + r.height / 2 - th / 2) };
  if (r.top - th - 16 >= m) return { side: "above", x: clampX(r.left), y: r.top - th - 16 };
  if (r.bottom + 16 + th <= H - m) return { side: "below", x: clampX(r.left), y: r.bottom + 16 };
  const low = r.top + r.height / 2 < H / 2;
  return { side: low ? "dock-bottom" : "dock-top", x: clampX((W - tw) / 2), y: low ? H - th - m : m };
}

/**
 * Points at one real element in the frame per step. Runs on the DOM
 * directly. Each frame it follows that step's element, which the canvas moves
 * and replaces as the visitor explores. It reads where the visitor is, and so
 * which step to show, only when the frame's DOM changes, and it sleeps while
 * the demo is off screen.
 */
function tour(frame: HTMLIFrameElement, stage: HTMLElement, replay: HTMLButtonElement): Tour {
  const root = stage.querySelector<HTMLElement>("[data-tour]")!;
  const ring = root.querySelector<HTMLElement>("[data-ring]")!;
  const tip = root.querySelector<HTMLElement>("[data-tip]")!;
  const text = tip.querySelector<HTMLElement>("[data-text]")!;
  const count = tip.querySelector<HTMLElement>("[data-count]")!;
  const end = tip.querySelector<HTMLElement>("[data-end]")!;
  const doc = () => {
    try {
      return frame.contentDocument?.body ? frame.contentDocument : null;
    } catch {
      return null;
    }
  };
  let mode: "off" | "on" | "done" = "off";
  let at = -1;
  let since = 0;
  let target: Element | null = null;
  // The element last scrolled into view, so a visitor scrolling away is left alone.
  let shown: Element | null = null;
  let side = "";
  let stale = true;
  let read = 0;
  let raf = 0;
  let near = true;
  let seen = false;
  let reloading = false;
  let hooked: Document | null = null;
  let watch: MutationObserver | null = null;
  // The tour's own scroll, which any input from the visitor cancels.
  let scrolling: { box: Element | Window; until: number } | null = null;
  let finished = 0;
  const timers: number[] = [];
  const after = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));
  const ringAt = mover(ring, true);
  const tipAt = mover(tip, false);
  const show = (el: HTMLElement, on: boolean) => {
    if (el.hidden === on) el.hidden = !on;
  };
  const hide = () => {
    show(ring, false);
    show(tip, false);
    ringAt.forget();
    tipAt.forget();
    side = "";
  };

  const step = (now: number) => {
    const d = doc();
    if (!d) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (mode === "done") {
      tipAt.to({ ...spot(undefined, W, H, tip.offsetWidth, tip.offsetHeight), w: 0, h: 0 }, now);
      return;
    }
    // The DOM changing marks the step stale; a slow re-read catches what no mutation shows, like a resize.
    if (stale || now - read > 250 || (target && !target.isConnected)) {
      stale = false;
      read = now;
      const next = stepOf(d);
      if (next !== at) {
        at = next;
        since = now;
        text.innerHTML = STEPS[at].text;
        count.textContent = `${at + 1} / ${STEPS.length}`;
        end.textContent = at === STEPS.length - 1 ? "Done" : "Skip tour";
      }
      const found = STEPS[at].find(d) ?? null;
      if (found !== target) {
        target = found;
        ringAt.glide(now);
        tipAt.glide(now);
      }
    }
    // A new level takes a moment to draw its cards: wait for them before falling back to the middle.
    if (!target && now - since < 700) {
      hide();
      return;
    }
    if (target && target !== shown) {
      shown = target;
      const r = target.getBoundingClientRect();
      if (r.top < 0 || r.top + Math.min(r.height, H / 3) > H) {
        scrolling = { box: within(target, "center", "smooth"), until: now + 1000 };
      }
    }
    const r = target?.getBoundingClientRect();
    const off = !r || r.bottom < 0 || r.top > H;
    // Appear on the target once the tour's own scroll brings it in, not in the middle first.
    if (off && target && scrolling && now < scrolling.until) {
      hide();
      return;
    }
    show(tip, true);
    if (off) {
      show(ring, false);
      ringAt.forget();
    } else {
      show(ring, true);
      ringAt.to({ x: r.left - 5, y: r.top - 5, w: r.width + 10, h: r.height + 10 }, now);
    }
    const s = spot(off ? undefined : r, W, H, tip.offsetWidth, tip.offsetHeight);
    if (s.side !== side) {
      if (side) tipAt.glide(now);
      side = s.side;
    }
    tipAt.to({ x: s.x, y: s.y, w: 0, h: 0 }, now);
  };

  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    step(now);
  };
  const run = () => {
    const want = (mode === "on" || mode === "done") && near;
    if (want && !raf) raf = requestAnimationFrame(loop);
    if (!want && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  // In the demo, Esc closes the open lines, then the open code, before the canvas leaves the level.
  // It listens on the document, under the window's own listeners, so an open dialog or menu closes first.
  const onEsc = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || e.defaultPrevented || (e.target as Element).closest?.("input, textarea, [contenteditable]")) return;
    const d = doc();
    const open = d && (refs(d).find(isOpen) ?? drawers(d).find(isOpen));
    if (!open) return;
    e.stopPropagation();
    open.click();
  };
  const onInput = () => {
    if (scrolling && performance.now() < scrolling.until) {
      const b = scrolling.box;
      b.scrollTo({ top: "scrollY" in b ? b.scrollY : b.scrollTop, behavior: "instant" });
    }
    scrolling = null;
  };
  const inputs = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
  const unhook = () => {
    watch?.disconnect();
    hooked?.removeEventListener("keydown", onEsc);
    for (const t of inputs) hooked?.removeEventListener(t, onInput, true);
  };
  const hook = () => {
    const d = doc();
    if (!d || hooked === d) return;
    unhook();
    contain(d);
    d.addEventListener("keydown", onEsc);
    for (const t of inputs) d.addEventListener(t, onInput, { capture: true, passive: true });
    watch = new MutationObserver(() => (stale = true));
    watch.observe(d.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-expanded", "disabled", "hidden", "data-path"],
    });
    hooked = d;
  };

  const go = () => {
    mode = "on";
    at = -1;
    target = shown = null;
    stale = true;
    end.textContent = "Skip tour";
    hide();
    hook();
    run();
  };
  const stop = () => {
    mode = "off";
    reloading = false;
    target = null;
    hide();
    replay.hidden = false;
    run();
  };
  const onEnd = () => (mode === "on" && at === STEPS.length - 1 ? finish() : stop());
  const finish = () => {
    mode = "done";
    show(ring, false);
    ringAt.forget();
    text.textContent = "That's the whole loop. Keep exploring, or pick another repository above.";
    count.textContent = "";
    end.textContent = "Done";
    tipAt.glide(performance.now());
    replay.hidden = false;
    run();
    const mine = ++finished;
    after(5000, () => {
      if (mode === "done" && mine === finished) stop();
    });
  };
  const begin = () => {
    replay.hidden = true;
    root.hidden = false;
    finished++;
    const d = doc();
    // Deep in a map, the tour starts over from its top level.
    if (d && stepOf(d) > 0) {
      mode = "off";
      hide();
      run();
      reloading = true;
      frame.contentWindow!.location.href = frame.src;
    } else go();
  };

  const onLoad = () => {
    if (!doc()) return;
    root.hidden = false;
    hook();
    if (reloading) {
      reloading = false;
      go();
    } else if (!seen) {
      seen = true;
      begin();
    }
  };
  const io = new IntersectionObserver(([e]) => {
    near = e.isIntersecting;
    run();
  });
  io.observe(stage);
  frame.addEventListener("load", onLoad);
  // Like the loaded state above: the first frame may have loaded before this ran.
  if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.URL !== "about:blank") onLoad();
  end.addEventListener("click", onEnd);
  replay.addEventListener("click", begin);
  return {
    away: () => {
      if (mode !== "off" || reloading) stop();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      raf = 0;
      timers.forEach(clearTimeout);
      io.disconnect();
      unhook();
      frame.removeEventListener("load", onLoad);
      end.removeEventListener("click", onEnd);
      replay.removeEventListener("click", begin);
    },
  };
}

/** Fetched in the browser, so a static export shows today's count, not the build's. */
export function StarCount({ repo }: { repo: string }) {
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    fetch(`https://api.github.com/repos/${repo}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCount(d.stargazers_count))
      .catch(() => {});
  }, [repo]);
  if (!count) return null;
  return (
    <span className={s.stars}>
      <svg viewBox="0 0 16 16" aria-hidden>
        <path d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z" />
      </svg>
      {count}
    </span>
  );
}
