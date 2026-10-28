"use client";

import { useEffect, useRef } from "react";
import s from "./landing.module.css";

export interface HowProps {
  /** The map the little windows show. */
  name: string;
  steps: string[];
  /** The step the cursor opens, and its parts. */
  opened: { title: string; sub: string; parts: string[] };
  /** The part the cursor follows to its code. */
  cited: { title: string; sub: string; file: string; start: number; lines: string[] };
}

const TABS = [
  { title: "Start with the steps", body: "The steps the program takes, in order." },
  { title: "Click a step to open it", body: "Only that step's parts appear." },
  { title: "Keep going to the code", body: "A part cites the lines it describes." },
];

const KEYWORDS = /\b(if|else|return|def|for|in|not|None|True|False)\b/;

/**
 * Three tabs, each a small window that plays one move through a real map:
 * the steps appear, a cursor opens one, then follows a part to its code. The
 * tabs advance on their own while the box is on screen.
 */
export function LandingHow({ name, steps, opened, cited }: HowProps) {
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
  const list = (cls?: string, target?: number) => (
    <ol className={s.list}>
      {steps.map((t, i) => (
        <li key={t} className={cls} data-in={cls ? "" : undefined} data-target={i === target ? "" : undefined}>
          <span className={s.n}>{i + 1}</span>
          {t}
        </li>
      ))}
    </ol>
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
                {list(s.in)}
              </div>
            </div>
            <div className={s.win} data-win="open" hidden>
              {bar}
              <div className={s.view} data-view>
                <div className={`${s.pane} ${s.paneA}`}>{list(undefined, steps.indexOf(opened.title))}</div>
                <div className={`${s.pane} ${s.paneB}`}>
                  <div className={s.head}>
                    <b>{opened.title}</b>
                    <span>{opened.sub}</span>
                  </div>
                  <ul className={s.parts}>
                    {opened.parts.map((p) => (
                      <li key={p} className={s.in} data-in>
                        {p}
                      </li>
                    ))}
                  </ul>
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
      const rows = ins(win);
      await wait(id, 300);
      for (const r of rows) {
        r.dataset.on = "true";
        await wait(id, 150);
      }
      await wait(id, 300);
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
        await wait(id, 160);
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
