"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AnatomyView, type RowCtx } from "@/components/anatomy";
import { KindLabel, UnitBody, UnitHead } from "@/components/card";
import { StateChip } from "@/components/state";
import { EASE, ownerOf } from "@/components/level";
import { useMap } from "@/components/map-context";
import type { Node } from "@/lib/data";

const codeUnder = (n: Node | undefined) => (n?.children ?? []).filter((c) => c.unit);

/** How the pane got to the list it shows: whose calls, or whose methods. */
interface Step {
  of: string;
  via: "calls" | "methods";
}

/**
 * The pane's code, as a list you can drill. At the top it is every function
 * under the open card. A function that calls others in the map offers
 * "calls ›", a class offers "methods ›"; either swaps the list for those, and
 * a small trail at the top steps back. Code depth lives here, inside the
 * pane, so the map's own trail never fills up with functions.
 *
 * Keyed by the open card, so the stack starts over whenever the map moves.
 * Cycles (A calls B calls A) are fine: it is a stack, not a tree walk.
 */
function CodeList({ node }: { node: Node }) {
  const { byId: BY_ID, titleOf } = useMap();
  const [stack, setStack] = useState<Step[]>([]);
  const top = stack[stack.length - 1];
  const list = useMemo(() => {
    if (!top) return codeUnder(node);
    const of = BY_ID.get(top.of);
    if (top.via === "methods") return codeUnder(of);
    return (of?.unit?.calls ?? []).flatMap((id) => BY_ID.get(id) ?? []);
  }, [node, top, BY_ID]);
  const section = useRef<HTMLElement>(null);

  // A drill swaps the whole list, so bring its top into view — otherwise you
  // are left looking at the middle of a list you didn't scroll.
  useEffect(() => {
    if (stack.length) section.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [stack.length]);

  if (!stack.length && !list.length) return null;
  return (
    <section ref={section} aria-label="Functions" className="mt-6 scroll-mt-4">
      <nav
        aria-label="Code trail"
        className="flex flex-wrap items-baseline gap-x-1.5 gap-y-1 font-mono text-[9.5px] text-faint"
      >
        {stack.length ? (
          <button
            type="button"
            data-row
            onClick={() => setStack((s) => s.slice(0, -1))}
            className="mr-1 cursor-pointer rounded-[4px] px-1 text-on-surface-variant transition-[background-color,color] duration-150 hover:bg-surface hover:text-ink"
          >
            ← back
          </button>
        ) : null}
        <Crumb onClick={stack.length ? () => setStack([]) : undefined}>
          <span className="uppercase tracking-[0.09em]">code</span> · {node.title}
        </Crumb>
        {stack.map((st, i) => (
          <span key={i} className="flex items-baseline gap-1.5">
            <span aria-hidden>›</span>
            <Crumb onClick={i < stack.length - 1 ? () => setStack((s) => s.slice(0, i + 1)) : undefined}>
              <span className="text-on-surface">{titleOf(st.of)}</span> {st.via}
            </Crumb>
          </span>
        ))}
        <span className="ml-1">· {list.length}</span>
      </nav>
      <div className="mt-2 flex flex-col gap-4">
        {list.map((u) => (
          <UnitPanel
            key={u.id}
            node={u}
            onDrill={(via) => setStack((s) => [...s, { of: u.id, via }])}
          />
        ))}
      </div>
    </section>
  );
}

function Crumb({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  if (!onClick) return <span>{children}</span>;
  return (
    <button
      type="button"
      data-row
      onClick={onClick}
      className="cursor-pointer rounded-[4px] px-0.5 transition-[background-color] duration-150 hover:bg-surface"
    >
      {children}
    </button>
  );
}

/**
 * One function or class in the pane's code list: name, editable signature,
 * what it does, its editable body, and the way down — the functions it calls,
 * or a class's methods.
 */
function UnitPanel({
  node,
  onDrill,
}: {
  node: Node;
  onDrill: (via: Step["via"]) => void;
}) {
  const { byId: BY_ID } = useMap();
  if (!node.unit) return null;
  const methods = codeUnder(node);
  const calls = (node.unit.calls ?? []).flatMap((id) => BY_ID.get(id) ?? []);
  return (
    <article
      data-unit={node.id}
      className="scroll-mt-4 rounded-[14px] border border-border-gray bg-pure-white px-4 py-3.5"
    >
      <KindLabel kind={node.kind} />
      <div className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-[14px] font-semibold text-ink">
          {node.title}
        </h2>
        <StateChip state={node.state} alarm={node.alarm} />
      </div>
      <UnitHead id={node.id} unit={node.unit} />
      {node.detail ? (
        <p className="mt-2.5 text-[11px] leading-relaxed text-on-surface-variant">
          {node.detail}
        </p>
      ) : null}
      <div className="mt-2.5">
        <UnitBody id={node.id} unit={node.unit} />
      </div>
      {methods.length || calls.length ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {methods.length ? (
            <DrillChip onClick={() => onDrill("methods")}>
              methods {methods.length} · {methods.map((m) => m.title).join(", ")}
            </DrillChip>
          ) : null}
          {calls.length ? (
            <DrillChip onClick={() => onDrill("calls")}>
              calls {calls.length} · {calls.map((c) => c.title).join(", ")}
            </DrillChip>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function DrillChip({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-row
      onClick={onClick}
      className="max-w-full cursor-pointer truncate rounded-full border border-border-gray bg-pure-white px-2.5 py-[3px] font-mono text-[9.5px] text-on-surface-variant transition-[border-color,color] duration-150 hover:border-border-strong hover:text-ink"
    >
      {children} ›
    </button>
  );
}

export function Detail({
  node,
  focusUnit,
  ctx,
  traced,
  onJump,
}: {
  node: Node | null;
  /** A unit to scroll to inside the pane, when the path named one. */
  focusUnit: string | null;
  ctx: RowCtx;
  traced: string | null;
  onJump: (id: string, trace?: string) => void;
}) {
  const { LINKS, RUN, titleOf } = useMap();
  const links = traced
    ? LINKS.filter((l) => l.from === traced || l.to === traced)
    : [];
  const pane = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!focusUnit) return;
    pane.current
      ?.querySelector(`[data-unit="${CSS.escape(focusUnit)}"]`)
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [focusUnit]);

  return (
    // Takes the rest of the width: it is where code is read and edited, and
    // a fixed 480px made every long line scroll sideways.
    <aside
      ref={pane}
      className="flex h-full min-w-[520px] flex-1 flex-col overflow-y-auto bg-pure-white px-6 py-5"
    >
      {node ? (
        <motion.div
          key={node.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.24, ease: EASE }}
        >
          <KindLabel kind={node.kind} />
          <div className="flex items-center gap-2">
            <h1
              className={cn(
                "min-w-0 flex-1 text-[17px] font-semibold tracking-[-0.01em] text-ink",
                node.unit && "font-mono",
              )}
            >
              {node.title}
            </h1>
            <StateChip state={node.state} alarm={node.alarm} />
          </div>
          {node.unit ? (
            <UnitHead id={node.id} unit={node.unit} />
          ) : (
            <p className="mt-0.5 font-mono text-[11.5px] text-faint">{node.sub}</p>
          )}

          <div className="mt-3 border-t border-border-gray pt-3">
            {node.detail ? (
              <p className="text-[11.5px] leading-relaxed text-on-surface-variant">
                {node.detail}
              </p>
            ) : null}
            {node.unit ? (
              <div className={cn(node.detail && "mt-3")}>
                <UnitBody id={node.id} unit={node.unit} />
              </div>
            ) : null}
            {node.anatomy ? (
              <div className={cn((node.detail || node.unit) && "mt-3")}>
                <AnatomyView owner={node.id} blocks={node.anatomy} ctx={ctx} />
              </div>
            ) : null}

            {links.length ? (
              <div className="mt-3 rounded-[12px] border border-border-gray bg-surface px-3 py-2.5">
                <p className="font-mono text-[9px] uppercase tracking-[0.09em] text-faint">
                  links from this row
                </p>
                <ul className="mt-1.5 flex flex-col gap-1">
                  {links.map((l) => {
                    const other = l.from === traced ? l.to : l.from;
                    const owner = ownerOf(other);
                    return (
                      <li key={`${l.from}>${l.to}`}>
                        <button
                          type="button"
                          data-row
                          onClick={() => onJump(owner, other)}
                          className={cn(
                            "w-full cursor-pointer rounded-[8px] px-2 py-1 text-left font-mono text-[10px] transition-[background-color] duration-150 hover:bg-pure-white",
                            l.alarm ? "text-clay-ink" : "text-on-surface",
                          )}
                        >
                          {l.from === traced ? "→" : "←"} {l.label ?? "links"} ·{" "}
                          <span className="font-semibold">{titleOf(owner)}</span>
                          <span className="text-faint"> · {other.slice(owner.length + 1)}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            {/* Provenance, always — except where the code header already says it. */}
            {node.evidence && !node.unit ? (
              <p className="mt-3 font-mono text-[10px] text-faint">{node.evidence}</p>
            ) : null}
          </div>

          <CodeList key={node.id} node={node} />
        </motion.div>
      ) : (
        <div className="mt-2 max-w-[340px]">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
            Start from what the user sees
          </p>
          <p className="mt-1.5 text-[11.5px] leading-relaxed text-on-surface-variant">
            The left column is the surface of {RUN.repo}. Pick a card to see the
            data flow behind it; keep going right to reach the code that does it.
          </p>
        </div>
      )}
    </aside>
  );
}
