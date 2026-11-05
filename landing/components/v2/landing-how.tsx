"use client";

import { useEffect, useRef } from "react";
import type { Diagram } from "./landing-agent";
import s from "./v2.module.css";

interface HowProps {
  /** The map the little windows show. */
  name: string;
  /** The map's first level: its steps, as the app draws them. */
  roots: Diagram;
  /** The step the cursor opens, and the diagram it opens onto. */
  opened: { id: string; title: string; sub: string; diagram: Diagram };
  /** The part the cursor follows to its code. */
  cited: { title: string; sub: string; file: string; start: number; lines: string[] };
}

const TABS = [
  { title: "Start with the steps", body: "The steps the program takes, in order." },
  { title: "Click a step to open it", body: "It opens onto a diagram of its parts." },
  { title: "Keep going to the code", body: "A part cites the lines it describes." },
];

const KEYWORDS = /\b(if|else|return|def|for|in|not|None|True|False)\b/;

/**
 * Three tabs, each a small window that plays one move through a real map:
 * the steps appear, a cursor opens one, then follows a part to its code. The
 * tabs advance on their own while the box is on screen.
 */
export function LandingHow({ name, roots, opened, cited }: HowProps) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => play(box.current!), []);

  const bar = (
    <div className={s.winBar}>
      <span className={s.dots}>
        <i />
        <i />
        <i />
      </span>
      <span className={s.winName}>{name}</span>
    </div>
  );
  const cursor = (
    <svg className={s.cur} data-cur viewBox="0 0 16 16">
      <path d="M2.5 1.5v12l3.2-3 2.2 4.7 2.1-1-2.2-4.6h4.4z" />
    </svg>
  );
  return (
    <section id="how" className={s.how} aria-labelledby="how-title">
      <p className={`${s.eyebrow} ${s.reveal}`}>How it works</p>
      <h2 id="how-title" className={s.reveal}>From the whole repo to one line.</h2>
      <div ref={box} className={`${s.frame} ${s.box} ${s.reveal}`}>
        <div className={s.rail} role="tablist" aria-label="How it works" aria-orientation="vertical">
          {TABS.map((t, i) => (
            <button
              key={t.title}
              role="tab"
              id={`how-tab-${i}`}
              aria-controls="how-panel"
              aria-selected={i === 0}
              tabIndex={i === 0 ? 0 : -1}
              data-tab
            >
              <i aria-hidden>{i + 1}</i>
              <b>{t.title}</b>
              <span>{t.body}</span>
            </button>
          ))}
        </div>
        <div className={s.panel} id="how-panel" role="tabpanel" aria-labelledby="how-tab-0" data-panel>
          <div className={s.scene} aria-hidden>
            <div className={s.win} data-win="steps">
              {bar}
              <div className={s.view} data-view>
                <Chart d={roots} />
              </div>
            </div>
            <div className={s.win} data-win="open" hidden>
              {bar}
              <div className={s.view} data-view>
                <div className={`${s.pane} ${s.paneA}`}>
                  <Chart d={roots} still target={opened.id} />
                </div>
                <div className={`${s.pane} ${s.paneB}`}>
                  <div className={s.head}>
                    <b>{opened.title}</b>
                    <span>{opened.sub}</span>
                  </div>
                  <Chart d={opened.diagram} />
                </div>
                {cursor}
              </div>
            </div>
            <div className={s.win} data-win="code" hidden>
              {bar}
              <div className={s.view} data-view>
                <div className={`${s.pane} ${s.paneA}`}>
                  <div className={s.head}>
                    <b>{cited.title}</b>
                    <span>{cited.sub}</span>
                  </div>
                  <span className={s.codeBtn} data-target>
                    <span>&lt;/&gt;</span>View the code
                  </span>
                </div>
                <div className={`${s.pane} ${s.paneB}`}>
                  <p className={s.file}>
                    <span>{cited.file}</span>
                    <span>
                      {cited.start}–{cited.start + cited.lines.length - 1}
                    </span>
                  </p>
                  <pre className={s.code}>
                    {cited.lines.map((l, i) => (
                      <span key={i} className={s.in} data-in>
                        <i>{cited.start + i}</i>
                        {l.split(KEYWORDS).map((part, j) => (j % 2 ? <b key={j}>{part}</b> : part))}
                      </span>
                    ))}
                  </pre>
                </div>
                {cursor}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const GY = 46;

/**
 * A diagram as the app's map draws it: boxes on a grid, joined by labelled
 * arrows, in the page's one ink. Boxes and arrows fade in one by one unless
 * `still`; `target` marks the box the cursor clicks.
 */
function Chart({ d, still, target }: { d: Diagram; still?: boolean; target?: string }) {
  // Boxes with a second line are wider, as the app draws them; plain ones pack closer.
  const subs = d.boxes.some((b) => b.sub);
  const BW = subs ? 190 : 160;
  const GX = subs ? 96 : 100;
  const bh = subs ? 58 : 50;
  const cols = Math.max(...d.boxes.map((b) => b.col)) + 1;
  const rows = Math.max(...d.boxes.map((b) => b.row)) + 1;
  const at = new Map(d.boxes.map((b) => [b.id, { x: 1 + b.col * (BW + GX), y: 1 + b.row * (bh + GY) }]));
  const w = cols * BW + (cols - 1) * GX + 2;
  const h = rows * bh + (rows - 1) * GY + 2;
  const fade = still ? {} : { className: s.in, "data-in": "" };
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={s.chart}>
      <defs>
        <marker id="how-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M1 1.2L7 4 1 6.8z" />
        </marker>
      </defs>
      {d.arrows.map((a) => {
        const f = at.get(a.from)!;
        const t = at.get(a.to)!;
        let path: string;
        let label: { x: number; y: number; anchor: "start" | "middle" };
        if (f.y === t.y) {
          const [x1, x2] = f.x < t.x ? [f.x + BW, t.x - 3] : [f.x, t.x + BW + 3];
          path = `M${x1} ${f.y + bh / 2}H${x2}`;
          label = { x: (x1 + x2) / 2, y: f.y + bh / 2 - 8, anchor: "middle" };
        } else if (f.x === t.x) {
          path = `M${f.x + BW / 2} ${f.y + bh}V${t.y - 3}`;
          label = { x: f.x + BW / 2 + 8, y: (f.y + bh + t.y) / 2 + 4, anchor: "start" };
        } else {
          // Out of the side, down the gap beside the target, and into its side.
          const left = t.x < f.x;
          const gx = left ? t.x + BW + GX / 2 : t.x - GX / 2;
          const sy = f.y + bh / 2 + (left ? 9 : 0);
          path = `M${left ? f.x : f.x + BW} ${sy}H${gx}V${t.y + bh / 2}H${left ? t.x + BW + 3 : t.x - 3}`;
          label = { x: gx + 7, y: f.y + bh + GY / 2 + 4, anchor: "start" };
        }
        return (
          <g key={a.from + a.to} {...fade}>
            <path d={path} markerEnd="url(#how-arrow)" />
            <text x={label.x} y={label.y} textAnchor={label.anchor}>
              {a.label}
            </text>
          </g>
        );
      })}
      {d.boxes.map((b) => {
        const { x, y } = at.get(b.id)!;
        return (
          <g key={b.id} {...fade} data-box="" data-target={b.id === target ? "" : undefined}>
            <rect x={x} y={y} width={BW} height={bh} />
            <text x={x + BW / 2} y={b.sub ? y + 25 : y + bh / 2 + 5} textAnchor="middle">
              {b.label}
            </text>
            {b.sub ? (
              <text x={x + BW / 2} y={y + 44} textAnchor="middle">
                {b.sub}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Plays the windows on the DOM directly. React renders the box once and never
 * again, so the flags set here are not overwritten.
 */
function play(box: HTMLElement) {
  const tabs = [...box.querySelectorAll<HTMLElement>("[data-tab]")];
  const wins = [...box.querySelectorAll<HTMLElement>("[data-win]")];
  const panel = box.querySelector<HTMLElement>("[data-panel]")!;
  const list = box.querySelector<HTMLElement>("[role=tablist]")!;
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let run = 0;
  let at = 0;
  let seen = false;
  let wake: (() => void) | null = null;
  const watch = new IntersectionObserver(
    ([e]) => {
      seen = e.isIntersecting;
      if (seen) wake?.();
    },
    { threshold: 0.3 },
  );
  watch.observe(box);

  // Waits `ms`, then for as long as the box is off screen. Throws once a newer run has started.
  const wait = async (id: number, ms: number) => {
    await new Promise((r) => setTimeout(r, ms));
    while (!seen && id === run) await new Promise<void>((r) => (wake = r));
    if (id !== run) throw new Error("stale");
  };
  const ins = (win: HTMLElement) => [...win.querySelectorAll<HTMLElement>("[data-in]")];
  const parts = (win: HTMLElement) => ({
    view: win.querySelector<HTMLElement>("[data-view]")!,
    cur: win.querySelector<HTMLElement>("[data-cur]"),
    hit: win.querySelector<HTMLElement>("[data-target]"),
  });
  const aim = (win: HTMLElement, cur: HTMLElement, el: HTMLElement) => {
    const v = parts(win).view.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    cur.style.setProperty("--x", `${b.left - v.left + Math.min(b.width * 0.55, 120)}px`);
    cur.style.setProperty("--y", `${b.top - v.top + b.height * 0.5}px`);
  };
  const park = (win: HTMLElement, cur: HTMLElement) => {
    const v = parts(win).view;
    cur.style.setProperty("--x", `${v.clientWidth - 48}px`);
    cur.style.setProperty("--y", `${v.clientHeight - 36}px`);
  };
  const reset = (win: HTMLElement) => {
    win.dataset.phase = "a";
    ins(win).forEach((e) => (e.dataset.on = "false"));
    win.querySelectorAll<HTMLElement>("[data-hit]").forEach((e) => (e.dataset.hit = "false"));
    const { cur } = parts(win);
    if (cur) {
      cur.dataset.on = "false";
      cur.dataset.down = "false";
      park(win, cur);
    }
  };
  const finish = (win: HTMLElement) => {
    ins(win).forEach((e) => (e.dataset.on = "true"));
    if (win.dataset.win !== "steps") win.dataset.phase = "b";
  };

  // The cursor moves to the target, clicks it, and the window's second pane appears.
  const open = async (win: HTMLElement, id: number) => {
    const { cur, hit } = parts(win) as { cur: HTMLElement; hit: HTMLElement };
    await wait(id, 400);
    cur.dataset.on = "true";
    await wait(id, 400);
    aim(win, cur, hit);
    await wait(id, 900);
    cur.dataset.down = "true";
    hit.dataset.hit = "true";
    await wait(id, 140);
    cur.dataset.down = "false";
    await wait(id, 250);
    cur.dataset.on = "false";
    win.dataset.phase = "b";
    await wait(id, 250);
  };
  const plays: Record<string, (win: HTMLElement, id: number) => Promise<void>> = {
    async steps(win, id) {
      await wait(id, 300);
      for (const r of ins(win)) {
        r.dataset.on = "true";
        await wait(id, 110);
      }
      await wait(id, 300);
      const rows = [...win.querySelectorAll<HTMLElement>("[data-box]")];
      for (const r of rows) {
        rows.forEach((x) => (x.dataset.hit = String(x === r)));
        await wait(id, 520);
      }
      await wait(id, 600);
    },
    async open(win, id) {
      await open(win, id);
      for (const p of ins(win)) {
        p.dataset.on = "true";
        await wait(id, 110);
      }
      await wait(id, 2600);
    },
    async code(win, id) {
      await open(win, id);
      for (const l of ins(win)) {
        l.dataset.on = "true";
        await wait(id, 120);
      }
      await wait(id, 3000);
    },
  };

  const show = (i: number) => {
    at = i;
    tabs.forEach((t, j) => {
      t.setAttribute("aria-selected", String(j === i));
      t.tabIndex = j === i ? 0 : -1;
    });
    panel.setAttribute("aria-labelledby", tabs[i].id);
    wins.forEach((w, j) => (w.hidden = j !== i));
    reset(wins[i]);
  };
  const start = async (i: number) => {
    const id = ++run;
    show(i);
    if (still) return finish(wins[i]);
    try {
      for (;;) {
        await plays[wins[at].dataset.win!](wins[at], id);
        await wait(id, 300);
        show((at + 1) % wins.length);
      }
    } catch {}
  };

  const clicks = tabs.map((t, i) => {
    const f = () => start(i);
    t.addEventListener("click", f);
    return f;
  });
  const onKey = (e: KeyboardEvent) => {
    const keys: Record<string, number> = { ArrowDown: at + 1, ArrowRight: at + 1, ArrowUp: at - 1, ArrowLeft: at - 1, Home: 0, End: tabs.length - 1 };
    const n = keys[e.key];
    if (n === undefined) return;
    e.preventDefault();
    const i = (n + tabs.length) % tabs.length;
    start(i);
    tabs[i].focus();
  };
  list.addEventListener("keydown", onKey);
  start(0);
  return () => {
    run = -1;
    wake?.();
    watch.disconnect();
    tabs.forEach((t, i) => t.removeEventListener("click", clicks[i]));
    list.removeEventListener("keydown", onKey);
  };
}
