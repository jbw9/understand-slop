"use client";

import { useEffect, useRef, useState } from "react";
import { STATIC_MAP } from "@/lib/source";
import s from "./landing.module.css";

export interface DemoMap {
  id: string;
  label: string;
  files: number;
  elapsed: string;
}

const src = (id: string) => (STATIC_MAP ? `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/${id}/` : `/?map=${id}&embed`);

/**
 * The real canvas, framed. Each tab points the frame at another committed
 * map, so what a visitor explores is the product itself, not a recording. A
 * static export has no server to read maps, so each tab opens that map's own
 * export, published beside this page. A guided tour starts on the first map
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

  // The first frame is server-rendered and can finish loading before React
  // hydrates, so its load event is missed. Read the document instead.
  useEffect(() => {
    const doc = frame.current?.contentDocument;
    if (doc?.readyState === "complete" && doc.URL !== "about:blank") setLoaded(open);
  }, [open]);

  useEffect(() => tour(frame.current!, stage.current!, tabs.current!, replay.current!), []);

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
            {/* The tour shows and hides this, and the bubble below, itself. */}
            <button ref={replay} className={s.replay} aria-label="Take the tour" hidden>
              <svg viewBox="0 0 16 16" aria-hidden>
                <path d="M2.75 8a5.25 5.25 0 1 0 1.6-3.77M2.75 2.5v3h3" />
              </svg>
              <span>Take the tour</span>
            </button>
            <span className={s.meta}>
              {current.files.toLocaleString("en-US")} files · mapped in {current.elapsed}
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
      <p className={s.cap}>
        This is the app, running on maps of real repositories. Click a step to open it, and press <kbd>Esc</kbd> to go
        back.
      </p>
    </>
  );
}

type Step = { text: string; key?: string; find: ((d: Document) => Element | undefined) | null };

const STEPS: Step[] = [
  { text: "Each card is one step the program takes. Click one to open it.", find: (d) => openable(d, 1) },
  { text: "These are that step's parts. Click one to see what it does.", find: (d) => openable(d, 2) },
  {
    text: "A part cites the code it describes. Click to see the lines.",
    find: (d) => visible(d, "button").find((b) => b.textContent?.includes("View the code")),
  },
  {
    text: "These are the exact lines it cites. Press <kbd>Esc</kbd> to go back one level.",
    key: "Escape",
    find: (d) => visible(d, "button").find((b) => /:\d+(–\d+)?/.test(b.textContent ?? "") && !b.closest("header")),
  },
];

const visible = (d: Document, sel: string) => [...d.querySelectorAll<HTMLElement>(sel)].filter((e) => e.offsetWidth);
const openable = (d: Document, depth: number) =>
  visible(d, "button[data-path]:not([disabled])").find((b) => JSON.parse(b.dataset.path!).length === depth);

/** Scrolls `el` inside its own scroller in the frame, never the page around it. */
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
  (box ?? view).scrollBy({ top: align === "start" ? r.top - top - margin : r.top - top - h / 2 + r.height / 2, behavior });
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

/**
 * Points at one real element in the frame per step and moves on when the
 * visitor does what it asks. Runs on the DOM directly: every animation frame
 * it follows the target, which the canvas moves and replaces as the visitor
 * explores.
 */
function tour(frame: HTMLIFrameElement, stage: HTMLElement, tabs: HTMLElement, replay: HTMLButtonElement) {
  const root = stage.querySelector<HTMLElement>("[data-tour]")!;
  const ring = root.querySelector<HTMLElement>("[data-ring]")!;
  const tip = root.querySelector<HTMLElement>("[data-tip]")!;
  const text = tip.querySelector<HTMLElement>("[data-text]")!;
  const count = tip.querySelector<HTMLElement>("[data-count]")!;
  const end = tip.querySelector<HTMLElement>("[data-end]")!;
  const steps = STEPS.map((x) => ({ ...x }));
  const doc = () => {
    try {
      return frame.contentDocument?.body ? frame.contentDocument : null;
    } catch {
      return null;
    }
  };
  let at = -1;
  let target: Element | null = null;
  let raf = 0;
  let since = 0;
  let seen = false;
  let hooked: Document | null = null;
  let finished = 0;
  const timers: number[] = [];
  const after = (ms: number, f: () => void) => timers.push(window.setTimeout(f, ms));

  const reveal = (el: Element) => {
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > el.ownerDocument.defaultView!.innerHeight) within(el, "center", "smooth");
  };

  const place = () => {
    raf = requestAnimationFrame(place);
    const d = doc();
    const step = steps[at];
    if (!d || !step) return;
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    // Measured once shown, and placed there without sliding in.
    const fresh = tip.hidden;
    if (fresh) {
      tip.style.transition = "none";
      tip.hidden = false;
    }
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let x: number;
    let y: number;
    if (step.find) {
      if (!target?.isConnected) {
        target = step.find(d) ?? null;
        if (target) reveal(target);
        else if (performance.now() - since > 4000) {
          if (!step.key) return finish();
          step.find = null;
        }
      }
      if (!target) {
        ring.hidden = tip.hidden = true;
        return;
      }
      const r = target.getBoundingClientRect();
      const off = r.bottom < 0 || r.top > H;
      if (ring.hidden && !off) {
        ring.style.transition = "none";
        requestAnimationFrame(() => (ring.style.transition = ""));
      }
      ring.hidden = off;
      ring.style.width = `${r.width + 10}px`;
      ring.style.height = `${r.height + 10}px`;
      ring.style.transform = `translate(${r.left - 5}px, ${r.top - 5}px)`;
      x = r.right + 18;
      y = r.top + r.height / 2 - th / 2;
      if (x + tw > W - 12) {
        x = r.left;
        y = r.top - th - 16;
        if (y < 12) y = r.bottom + 16;
      }
    } else {
      ring.hidden = true;
      x = (W - tw) / 2;
      y = H - th - 28;
    }
    x = Math.max(12, Math.min(x, W - tw - 12));
    y = Math.max(12, Math.min(y, H - th - 12));
    tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (fresh) requestAnimationFrame(() => (tip.style.transition = ""));
  };

  const onClick = (e: Event) => {
    if (steps[at]?.find && !steps[at].key && target?.contains(e.target as Node)) after(450, () => go(at + 1));
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === steps[at]?.key) after(350, () => go(at + 1));
  };
  const hook = () => {
    const d = doc();
    if (!d || hooked === d) return;
    contain(d);
    hooked?.removeEventListener("click", onClick, true);
    hooked?.defaultView?.removeEventListener("keydown", onKey, true);
    d.addEventListener("click", onClick, true);
    d.defaultView!.addEventListener("keydown", onKey, true);
    hooked = d;
  };

  const go = (i: number) => {
    if (i >= steps.length) return finish();
    at = i;
    target = null;
    since = performance.now();
    steps[i].find = STEPS[i].find;
    hook();
    text.innerHTML = steps[i].text;
    count.textContent = `${i + 1} / ${steps.length}`;
    end.textContent = "Skip tour";
    if (!raf) place();
  };
  const stop = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    at = -1;
    target = null;
    ring.hidden = tip.hidden = true;
    replay.hidden = false;
  };
  const finish = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    at = steps.length;
    target = null;
    ring.hidden = true;
    text.textContent = "That's the whole loop. Keep exploring, or pick another repository above.";
    count.textContent = "";
    end.textContent = "Done";
    tip.hidden = false;
    const x = Math.round((stage.clientWidth - tip.offsetWidth) / 2);
    const y = Math.round(stage.clientHeight - tip.offsetHeight - 28);
    tip.style.transform = `translate(${x}px, ${y}px)`;
    replay.hidden = false;
    const mine = ++finished;
    after(5000, () => {
      if (at === steps.length && mine === finished) stop();
    });
  };
  const begin = () => {
    replay.hidden = true;
    root.hidden = false;
    const d = doc();
    // Deep in a map, the tour starts over from its top level.
    if (d && !openable(d, 1)) {
      frame.addEventListener("load", () => go(0), { once: true });
      frame.contentWindow!.location.href = frame.src;
    } else go(0);
  };

  const onLoad = () => {
    if (!doc()) return;
    root.hidden = false;
    hook();
    if (!seen) {
      seen = true;
      begin();
    }
  };
  const onTab = (e: Event) => {
    if ((e.target as Element).closest("[data-id]") && at >= 0) stop();
  };
  frame.addEventListener("load", onLoad);
  // Like the loaded state above: the first frame may have loaded before this ran.
  if (frame.contentDocument?.readyState === "complete" && frame.contentDocument.URL !== "about:blank") onLoad();
  end.addEventListener("click", stop);
  replay.addEventListener("click", begin);
  tabs.addEventListener("click", onTab);
  return () => {
    cancelAnimationFrame(raf);
    timers.forEach(clearTimeout);
    frame.removeEventListener("load", onLoad);
    end.removeEventListener("click", stop);
    replay.removeEventListener("click", begin);
    tabs.removeEventListener("click", onTab);
    hooked?.removeEventListener("click", onClick, true);
    hooked?.defaultView?.removeEventListener("keydown", onKey, true);
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
