"use client";

import { useLayoutEffect, useRef, useState } from "react";
import s from "./landing.module.css";

export interface ChangedFile {
  path: string;
  add: number;
  del: number;
  /** The section that explains it, root first; null when the map doesn't have it yet. */
  at: string[] | null;
}

export interface Change {
  commit: string;
  date: string;
  what: string;
  roots: { id: string; title: string }[];
  /** The root the change mostly lives in, and its parts. */
  open: { id: string; parts: { id: string; title: string }[] };
  files: ChangedFile[];
  wall: string[];
}

const name = (p: string) => p.slice(p.lastIndexOf("/") + 1);
const sum = (fs: ChangedFile[]) => fs.reduce((a, f) => ({ add: a.add + f.add, del: a.del + f.del }), { add: 0, del: 0 });
// Sections are coloured by their place among their siblings, as the app colours them.
const hue = (i: number) => ({ "--s": `var(--color-sec-${(i % 7) + 1}-surface)`, "--c": `var(--color-sec-${(i % 7) + 1}-ink)` }) as React.CSSProperties;

/** A file, as a chip: where it is drawn changes, the element's identity doesn't, so it can fly between the two. */
function File({ f, short }: { f: ChangedFile; short?: boolean }) {
  return (
    <span className={s.chip} data-file={f.path} title={f.path}>
      <span className={s.chipName}>{short ? name(f.path) : f.path}</span>
      <span className={s.chipCount}>
        +{f.add}
        {f.del ? ` −${f.del}` : ""}
      </span>
    </span>
  );
}

/**
 * One real change, two ways: the list of files a terminal or an editor shows,
 * and the same files on the map, in the sections that explain them. Switching
 * flies each file from where it was to where it lands.
 */
export function LandingChange({ change }: { change: Change }) {
  const [mode, setMode] = useState<"files" | "map">("files");
  const box = useRef<HTMLDivElement>(null);
  const before = useRef<Map<string, DOMRect> | null>(null);

  const flip = (next: "files" | "map") => {
    if (next === mode) return;
    before.current = new Map(
      [...box.current!.querySelectorAll<HTMLElement>("[data-file]")].map((e) => [e.dataset.file!, e.getBoundingClientRect()]),
    );
    setMode(next);
  };

  useLayoutEffect(() => {
    const old = before.current;
    before.current = null;
    if (!old || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const els = [...box.current!.querySelectorAll<HTMLElement>("[data-file]")];
    els.forEach((e, i) => {
      const was = old.get(e.dataset.file!);
      if (!was) return;
      const now = e.getBoundingClientRect();
      e.animate(
        [
          { transform: `translate(${was.left - now.left}px, ${was.top - now.top}px)`, opacity: 0.6 },
          { transform: "none", opacity: 1 },
        ],
        { duration: 700, delay: i * 35, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
      );
    });
    // Sections arrive after the files have started to move, so the eye follows the files.
    box.current!.querySelectorAll<HTMLElement>("[data-lit]").forEach((e) =>
      e.animate([{ opacity: 0.35 }, { opacity: 1 }], { duration: 500, delay: 250, easing: "ease-out", fill: "backwards" }),
    );
  }, [mode]);

  const inRoot = (id: string) => change.files.filter((f) => f.at?.[0] === id);
  const inPart = (id: string) => change.files.filter((f) => f.at?.[0] === change.open.id && f.at[1] === id);
  const onRoot = change.files.filter((f) => f.at?.[0] === change.open.id && !f.at[1]);
  const unmapped = change.files.filter((f) => !f.at);
  const roots = change.roots.filter((r) => inRoot(r.id).length);
  const parts = change.open.parts.filter((p) => inPart(p.id).length);
  const openRoot = change.roots.find((r) => r.id === change.open.id)!;
  const total = sum(change.files);

  return (
    <figure className={s.change} aria-label={`${change.what}: ${change.files.length} files, as files and on the map`}>
      <div className={s.changeBar}>
        <div className={s.toggle} role="radiogroup" aria-label="Show the change">
          {(["files", "map"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} onClick={() => flip(m)}>
              {m === "files" ? "As files" : "On the map"}
            </button>
          ))}
        </div>
        <p className={s.changeMeta}>
          {change.what} · {change.files.length} files · <span className={s.plus}>+{total.add}</span>{" "}
          <span className={s.minus}>−{total.del}</span>
        </p>
      </div>

      <div ref={box} className={s.changeBody} data-mode={mode}>
        {mode === "files" ? (
          <div className={s.flat}>
            {change.files.map((f) => (
              <File key={f.path} f={f} />
            ))}
          </div>
        ) : (
          <div className={s.onMap}>
            <ol className={s.roots} aria-label="The product's parts">
              {change.roots.map((r, i) => {
                const fs = inRoot(r.id);
                return (
                  <li key={r.id} style={hue(i)} data-lit={fs.length ? "" : undefined} className={s.root}>
                    <b>{r.title}</b>
                    {fs.length ? (
                      <span className={s.tally}>
                        {fs.length} {fs.length === 1 ? "file" : "files"}
                      </span>
                    ) : (
                      <span className={s.quiet}>no change</span>
                    )}
                    {r.id !== change.open.id && fs.length ? (
                      <span className={s.chips}>
                        {fs.map((f) => (
                          <File key={f.path} f={f} short />
                        ))}
                      </span>
                    ) : null}
                  </li>
                );
              })}
            </ol>
            <div className={s.inside} style={hue(change.roots.indexOf(openRoot))}>
              <p className={s.insideHead}>
                <b>Inside {openRoot.title}</b>
                {onRoot.map((f) => (
                  <File key={f.path} f={f} short />
                ))}
              </p>
              <ol className={s.parts9}>
                {change.open.parts.map((p, i) => {
                  const fs = inPart(p.id);
                  return (
                    <li key={p.id} style={hue(i)} data-lit={fs.length ? "" : undefined}>
                      <b>{p.title}</b>
                      {fs.length ? (
                        <span className={s.chips}>
                          {fs.map((f) => (
                            <File key={f.path} f={f} short />
                          ))}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            </div>
            <div className={s.unmapped}>
              <p>Not on the map yet</p>
              <span className={s.chips}>
                {unmapped.map((f) => (
                  <File key={f.path} f={f} short />
                ))}
              </span>
            </div>
          </div>
        )}
      </div>

      <figcaption className={s.changeCap}>
        {mode === "files" ? (
          <>The change as an editor or a terminal shows it: every file, in alphabetical order. Switch to see it on the map.</>
        ) : (
          <>
            {roots.length} of {change.roots.length} parts of the product changed. Inside {openRoot.title}, {parts.length} of{" "}
            {change.open.parts.length}. The new files aren&rsquo;t on the map until it next updates.
          </>
        )}{" "}
        Commit <code>{change.commit}</code> in this repository.
      </figcaption>
    </figure>
  );
}
