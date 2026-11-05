"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import s from "./v2.module.css";
import { Drawn, type Drawing } from "./landing-features";

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
 * What the app does, a tab each. The first is the app itself; the rest need
 * the desktop app, so they are drawn (landing-features.tsx). `project` names
 * the drawing's map in the window's bar.
 */
const FEATURES: { id: "explore" | Drawing; label: string; project?: string; cap?: string }[] = [
  { id: "explore", label: "Explore a codebase" },
  {
    id: "claude",
    label: "Ask Claude Code",
    project: "flask",
    cap: "In the desktop app, Claude Code runs in a tab beside the map. Right-click a part to hand it to Claude, and Claude moves your view to what it’s talking about.",
  },
  {
    id: "plan",
    label: "Read the plan",
    project: "bluprint",
    cap: "In the desktop app, a plan from Claude’s plan mode opens as a short doc: a picture of what it will change, the screen you’ll see, then the steps and files, before a line is written. Accept it right there.",
  },
  {
    id: "review",
    label: "Review diffs",
    project: "flask",
    cap: "In the desktop app, a commit, branch or pull request is drawn on the map you already know: the parts it touched, by how much, and the lines under each.",
  },
  {
    id: "run",
    label: "Preview your app",
    project: "habits",
    cap: "In the desktop app, your web app runs in a Preview tab and your phone app on the iOS Simulator or Android emulator. Claude can see both, and tap through them too.",
  },
];

/** Arrow keys, Home and End walk a tab list, as the ARIA tabs pattern has them. */
function walk(e: React.KeyboardEvent<HTMLElement>, ids: string[], at: string, go: (id: string) => void) {
  const i = ids.indexOf(at);
  const keys: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ids.length - 1 };
  const next = keys[e.key];
  if (next === undefined) return;
  e.preventDefault();
  const id = ids[(next + ids.length) % ids.length];
  go(id);
  e.currentTarget.querySelector<HTMLElement>(`[data-id="${id}"]`)!.focus();
}

/**
 * The app, one tab per thing it does. Exploring is the real canvas, framed:
 * the window's own tabs point the frame at another committed map, so what a
 * visitor explores is the product itself, not a recording. The page is static
 * and has no server to read maps, so each opens that map's own export,
 * published beside it, and the button under the frame starts a guided tour
 * that points at the real cards inside it. The other tabs are drawn.
 */
export function LandingDemo({ maps }: { maps: DemoMap[] }) {
  const [feature, setFeature] = useState(FEATURES[0].id);
  const [open, setOpen] = useState(maps[0].id);
  const [loaded, setLoaded] = useState<string | null>(null);
  const current = maps.find((m) => m.id === open)!;
  const shown = FEATURES.find((x) => x.id === feature)!;
  const exploring = shown.id === "explore";
  const frame = useRef<HTMLIFrameElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const features = useRef<HTMLDivElement>(null);
  const pill = useRef<HTMLSpanElement>(null);
  const replay = useRef<HTMLButtonElement>(null);
  const guide = useRef<Tour>(null);
  const shownMap = useRef(open);

  // The page is always the white sheet, so the app in it is always Classic, the sheet's own cobalt, whatever the reader picked in the app.
  // The frame shows the demos as its own tabs, one per repository (app/components/tabs.tsx).
  const light = () => {
    try {
      frame.current!.contentDocument!.documentElement.dataset.theme = "classic";
    } catch {}
    tell();
  };
  const tell = () =>
    frame.current?.contentWindow?.postMessage(
      { type: "slop:repos", repos: maps.map(({ id, label }) => ({ id, label })), open },
      location.origin,
    );

  // The frame asks for its tabs once it listens, and a tab picked there points it at that repository.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== location.origin || e.source !== frame.current?.contentWindow) return;
      if (e.data?.type === "slop:ready") tell();
      if (e.data?.type === "slop:open") setOpen(e.data.id);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  });

  // The first frame is server-rendered and can finish loading before React
  // hydrates, so its load event is missed. Read the document instead.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") {
      light();
      setLoaded(open);
    }
  }, [open]);

  // Another repository, whether picked by click or by arrow key, or another of the app's tools, ends the tour.
  useEffect(() => {
    if (shownMap.current === open && exploring) return;
    shownMap.current = open;
    guide.current?.away();
  }, [open, exploring]);

  // Keys go only to the focused document, so Esc pressed on the page around
  // the demo never reached the map. Hand it on while the demo is on screen.
  useEffect(() => {
    if (!exploring) return;
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
  }, [exploring]);

  useEffect(() => {
    const t = tour(frame.current!, stage.current!, replay.current!);
    guide.current = t;
    return t.dispose;
  }, []);

  // The open tab's background is one pill that slides to the tab picked. It
  // starts sliding only once placed, so it never sweeps in from the left.
  useLayoutEffect(() => {
    const list = features.current!;
    const place = () => {
      const b = list.querySelector<HTMLElement>(`[data-id="${feature}"]`)!;
      pill.current!.style.setProperty("--x", `${b.offsetLeft}px`);
      pill.current!.style.setProperty("--w", `${b.offsetWidth}px`);
      if (!("pill" in list.dataset)) requestAnimationFrame(() => (list.dataset.pill = ""));
    };
    place();
    const watch = new ResizeObserver(place);
    watch.observe(list);
    return () => watch.disconnect();
  }, [feature]);

  return (
    <>
      <div className={`${s.switcher} ${s.rise}`} style={{ "--i": 3 } as React.CSSProperties}>
        <div
          ref={features}
          role="tablist"
          aria-label="What Bluprint does"
          className={s.tabs}
          onKeyDown={(e) => walk(e, FEATURES.map((x) => x.id), feature, (id) => setFeature(id as typeof feature))}
        >
          <span ref={pill} aria-hidden className={s.pill} />
          {FEATURES.map((x) => (
            <button
              key={x.id}
              role="tab"
              id={`feature-${x.id}`}
              aria-controls="demo-panel"
              data-id={x.id}
              aria-selected={x.id === feature}
              tabIndex={x.id === feature ? 0 : -1}
              onClick={() => setFeature(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <div
        id="demo-panel"
        role="tabpanel"
        aria-labelledby={`feature-${feature}`}
        className={s.rise}
        style={{ "--i": 4 } as React.CSSProperties}
      >
        <div className={s.canvas} data-drawn={!exploring}>
          {/* The app brings its own strip along the top; only a drawing needs a bar to name its map. */}
          {exploring ? null : (
            <div className={s.bar}>
              <div aria-hidden className={s.lights}>
                <span />
                <span />
                <span />
              </div>
              <span className={s.project}>{shown.project}</span>
            </div>
          )}
          <div ref={stage} className={s.stage} data-ready={loaded === open}>
            {exploring && loaded !== open ? <p className={s.loading}>loading {current.id}…</p> : null}
            {/* Kept while another tab is open, so coming back finds the map where it was left. */}
            <iframe
              ref={frame}
              src={src(open)}
              title={`${current.label}, explored`}
              hidden={!exploring}
              onLoad={() => {
                light();
                setLoaded(open);
              }}
            />
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
            {shown.id === "explore" ? null : <Drawn key={shown.id} drawing={shown.id} />}
          </div>
        </div>
      </div>
      <div className={s.under}>
        <div className={s.controls} hidden={!exploring}>
          {/* The tour shows and hides this, and the bubble in the frame, itself. */}
          <button ref={replay} className={`${s.btn} ${s.ghost} ${s.replay}`}>
            Give me a tour
          </button>
        </div>
        <p className={s.cap}>
          {exploring ? (
            <>
              This is the app, running on maps of real repositories. Click a step to open it, and press <kbd>Esc</kbd> to
              go back.
            </>
          ) : (
            shown.cap
          )}
        </p>
      </div>
    </>
  );
}

type Step = { text: string; find: (d: Document) => Element | undefined };

const STEPS: Step[] = [
  { text: "Each card is one step the program takes. Click one to open it.", find: (d) => openable(d, 1) },
  { text: "These are that step's parts. Click one to see what it does.", find: (d) => openable(d, 2) },
  { text: "Each step names the code that does it. Click one to see its lines.", find: (d) => codeSteps(d)[0] ?? viewCode(d) },
  {
    text: "These are the exact lines, under the step they do. Press <kbd>Esc</kbd> to close them.",
    find: (d) => d.querySelector('[role="dialog"]') ?? undefined,
  },
];

const visible = (d: Document, sel: string) => [...d.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetWidth);
// A level whose parts are all boxes on its diagram has no list: the boxes (SVG links, no offsetWidth) are the way down.
const openable = (d: Document, depth: number) =>
  [...d.querySelectorAll<Element>("button[data-path]:not([disabled]), a[data-opens]")]
    .filter((e) => e.getBoundingClientRect().width)
    .find((e) =>
      e instanceof HTMLElement && e.dataset.path
        ? JSON.parse(e.dataset.path).length === depth
        : new URLSearchParams(e.getAttribute("href")!.slice(1)).getAll("at").length === depth,
    );
/** Steps and messages that open the lines they cite (D68). */
const codeSteps = (d: Document) => visible(d, "[data-code-step]");
/** A leaf whose blocks cite no lines still opens its code from the header. */
const viewCode = (d: Document) => visible(d, "button").find((b) => /View the code/.test(b.textContent ?? ""));

/**
 * Where the visitor is decides the step, not which click they were asked
 * for: going off script, or back up, shows the step for where they are.
 */
function stepOf(d: Document) {
  if (d.querySelector('[role="dialog"]')) return 3;
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
    for (const t of inputs) hooked?.removeEventListener(t, onInput, true);
  };
  const hook = () => {
    const d = doc();
    if (!d || hooked === d) return;
    unhook();
    contain(d);
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
    text.textContent = "That's the whole loop. Keep exploring, or open another repository from the tabs above.";
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
