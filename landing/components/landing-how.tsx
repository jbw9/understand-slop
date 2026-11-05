"use client";

import { useState } from "react";
import type { Step } from "@/lib/maps";
import { usePicked } from "./landing-picked";
import s from "./landing.module.css";

const KEYWORDS =
  /\b(if|else|elif|return|def|class|for|in|not|None|True|False|import|from|const|let|function|export|async|await|new|this|self|fn|pub|val|private|public|static)\b/;

const hue = (i: number) => ({ "--s": `var(--color-sec-${(i % 7) + 1}-surface)`, "--c": `var(--color-sec-${(i % 7) + 1}-ink)` }) as React.CSSProperties;

/**
 * Three levels of one real map side by side: its steps, the parts of the step
 * you pick, and the lines the part you pick cites. It follows the repository
 * open in the demo above.
 */
export function LandingHow({ maps, labels, first }: { maps: Record<string, Step[]>; labels: Record<string, string>; first: string }) {
  const id = usePicked(first);
  return <Levels key={id} name={labels[id]} steps={maps[id]} />;
}

function Levels({ name, steps }: { name: string; steps: Step[] }) {
  const [step, setStep] = useState(0);
  const firstCited = (i: number) => Math.max(0, steps[i].parts.findIndex((p) => p.cite));
  const [part, setPart] = useState(() => firstCited(0));
  const open = steps[step];
  const cited = open.parts[part]?.cite;

  return (
    <section id="how" data-trail="How it works" className={s.how} aria-labelledby="how-title">
      <div className={s.howHead}>
        <h2 id="how-title">From the whole repo to one line.</h2>
        <p className={s.intro}>
          This is {name}, three levels down. Pick a step, then one of its parts, and read the lines it cites. Pick
          another repository in the demo above and this follows it.
        </p>
      </div>
      <div className={s.levels}>
        <div className={s.level}>
          <p className={s.levelHead}>
            <b>{name}</b>
            <span>{steps.length} steps the program takes</span>
          </p>
          <ol className={s.pickList}>
            {steps.map((st, i) => (
              <li key={st.title} style={hue(i)}>
                <button
                  aria-pressed={i === step}
                  onClick={() => {
                    setStep(i);
                    setPart(firstCited(i));
                  }}
                >
                  <i aria-hidden />
                  <b>{st.title}</b>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className={s.level} style={hue(step)} data-inside>
          <p className={s.levelHead}>
            <b>{open.title}</b>
            <span>{open.sub}</span>
          </p>
          <ol className={s.pickList}>
            {open.parts.map((p, i) => (
              <li key={p.title} style={hue(i)}>
                <button aria-pressed={i === part} disabled={!p.cite} onClick={() => setPart(i)}>
                  <i aria-hidden />
                  <b>{p.title}</b>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className={`${s.level} ${s.lines}`}>
          <p className={s.levelHead}>
            <b>{open.parts[part]?.title}</b>
            <span>{open.parts[part]?.sub}</span>
          </p>
          {cited ? (
            <figure className={s.cited}>
              <figcaption>
                <code>{cited.file}</code>
                <span>
                  {cited.start}–{cited.start + cited.lines.length - 1}
                </span>
              </figcaption>
              <pre>
                {cited.lines.map((l, i) => (
                  <span key={i}>
                    <i>{cited.start + i}</i>
                    {l.split(KEYWORDS).map((bit, j) => (j % 2 ? <b key={j}>{bit}</b> : bit))}
                  </span>
                ))}
              </pre>
            </figure>
          ) : (
            <p className={s.quiet}>This part cites no lines.</p>
          )}
        </div>
      </div>
    </section>
  );
}
