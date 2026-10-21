"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { AnatomyView, type RowCtx } from "@/components/anatomy";
import { ShapeView } from "@/components/shapes";
import { Eyebrow, StateChip } from "@/components/state";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { Trail } from "@/components/chrome";
import { E0, L0, LINKS, RUN, levelAt, nodeAt } from "@/lib/map";
import type { Edge, Node } from "@/lib/data";
import { BLURB_LINES, type Shape } from "@/lib/view";

/**
 * The whole screen: ONE level at a time.
 *
 * The board used to be a pan/zoom canvas where every drill unfolded another
 * row of cards beside the last. Each level added width, siblings were squeezed
 * to fit a 360px wrapper (Formulas rendered one word per line), and the top
 * level was a hand-placed serpentine whose second row read right-to-left. See
 * D28.
 *
 * Now the node you opened is the header, its children are the body, and the
 * way back is the trail on the left. Every level — the repo included — is the
 * same template, so depth costs nothing visually: level six looks like level
 * one, and the bottom of every branch is the code itself.
 */


/**
 * The filer's path, in the order E0 chains it. E0 is one chain in
 * ONBOARDING_STEPS order, so walking it from its first `from` IS the sequence.
 */
const CHAIN = (() => {
  const sorted = [...E0].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return sorted.length ? [sorted[0].from, ...sorted.map((e) => e.to)] : [];
})();

/** 1-indexed position on the filer's path, for roots that are on it. */
function stepOf(id: string) {
  const i = CHAIN.indexOf(id);
  return i === -1 ? undefined : i + 1;
}

function authored(node: Node) {
  return (node.children ?? []).filter((c) => !c.fromRow);
}

/** Opening a card shows something: its children, or its own rows in full. */
function openable(node: Node) {
  return authored(node).length > 0 || Boolean(node.anatomy?.length);
}

/**
 * The arrows between a node's children — only where the node declares a
 * sequence (D19, D21). A set gets nothing and says so via `setNote`.
 */
function siblingEdges(node: Node, kids: Node[]): Edge[] {
  if (node.group?.ordering !== "sequence" || kids.length < 2) return [];
  if (node.edges?.length) return node.edges;
  return kids.slice(1).map((c, i) => ({
    from: kids[i].id,
    to: c.id,
    state: kids[i].state === "derived" && c.state === "derived" ? "derived" : "partial",
    order: i + 1,
  }));
}

/**
 * The line an unordered level says about itself. No `group` at all says
 * nothing: an unbacked claim about ordering is the same mistake as an unbacked
 * arrow, pointing the other way.
 */
function setNote(node: Node): string | null {
  if (!node.group || node.group.ordering === "sequence") return null;
  return node.group.note ?? "No order between these — they are a set, not a flow.";
}

export function Canvas() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { nodes, anchor, version } = useWireAnchors();

  /**
   * The open path, root-first, read from the URL (`?at=engine&at=eng-math`).
   * `[]` is the repo; depth is its length.
   *
   * The URL rather than state because every level is then a history entry:
   * the browser's back button and the trackpad's two-finger swipe step back
   * the way they do everywhere else, and a level can be linked or reloaded.
   * Clicking empty space used to go back, and an accidental click on the
   * background threw away where you were.
   */
  const params = useSearchParams();
  const path = useMemo(() => {
    const asked = params.getAll("at");
    return asked.length && nodeAt(asked) ? asked : [];
  }, [params]);
  const key = path.join("/");
  const focus = path.length ? nodeAt(path) : null;

  // Which way the level slides: deeper or back. Derived when the depth
  // changes, during render, so the exiting level already knows its direction.
  const [moved, setMoved] = useState({ depth: path.length, dir: 1 });
  if (moved.depth !== path.length) {
    setMoved({ depth: path.length, dir: path.length > moved.depth ? 1 : -1 });
  }
  const dir = moved.dir;

  // A trace belongs to the level it was started on, and ends when you leave.
  const [trace, setTrace] = useState<{ at: string; id: string } | null>(null);
  const traced = trace?.at === key ? trace.id : null;
  const setTraced = useCallback(
    (id: string | null) => setTrace(id ? { at: key, id } : null),
    [key],
  );

  // Native pushState is integrated with the App Router: `useSearchParams`
  // follows it, and so does back/forward.
  const go = useCallback((next: string[]) => {
    const q = new URLSearchParams();
    for (const id of next) q.append("at", id);
    window.history.pushState(null, "", q.size ? `?${q}` : window.location.pathname);
  }, []);

  // A new level starts at its top, not wherever the last one was scrolled to.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [key]);

  /* ── tracing a row-level chain ────────────────────────────── */

  // Depth-capped walk of LINKS outward from the clicked row, so a click on a
  // foreign key lights what it references AND what reads that, not one hop.
  const lit = useMemo(() => {
    if (!traced) return new Set<string>();
    const seen = new Set<string>([traced]);
    let frontier = [traced];
    for (let hop = 0; hop < 6 && frontier.length; hop++) {
      const next: string[] = [];
      for (const id of frontier) {
        for (const l of LINKS) {
          if (l.from === id && !seen.has(l.to)) { seen.add(l.to); next.push(l.to); }
          if (l.to === id && !seen.has(l.from)) { seen.add(l.from); next.push(l.from); }
        }
      }
      frontier = next;
    }
    return seen;
  }, [traced]);

  // Only row-to-row wires remain: sibling order is drawn by `Sequence` itself,
  // where a wrapping layout can't send a wire across a card. Foreign keys show
  // when both ends are on screen; a trace replaces them while it is active.
  const wires = useMemo<Wire[]>(() => {
    const kind = (l: (typeof LINKS)[number]) => wireKind(l.state, l.alarm);
    if (traced) {
      return LINKS.filter((l) => lit.has(l.from) && lit.has(l.to)).map((l) => ({
        from: l.from,
        to: l.to,
        kind: kind(l),
        depth: l.from === traced || l.to === traced ? 0 : 1,
        relation: l.label === "FK",
      }));
    }
    if (!focus) return [];
    const shown = new Set([focus.id, ...levelAt(path).map((n) => n.id)]);
    const owner = (rowKey: string) => rowKey.slice(0, rowKey.lastIndexOf(":"));
    return LINKS.filter(
      (l) => l.label === "FK" && shown.has(owner(l.from)) && shown.has(owner(l.to)),
    ).map((l) => ({ from: l.from, to: l.to, kind: kind(l), depth: 0, relation: true }));
  }, [traced, lit, focus, path]);

  /* ── rows that open their own level ───────────────────────── */

  const onOpenRow = useCallback(
    (id: string) => {
      // The row id names its owner (`eng-path:2` owns `eng-path:2:not expired`,
      // hence lastIndexOf). The owner is either the open node or a card on the
      // level below it, so cut the path back to it or step into it — never
      // just append.
      const owner = id.slice(0, id.lastIndexOf(":"));
      const ownerAt = path.indexOf(owner);
      const at = ownerAt === -1 ? [...path, owner] : path.slice(0, ownerAt + 1);
      if (nodeAt([...at, id])) go([...at, id]);
    },
    [path, go],
  );

  const ctx = useMemo<RowCtx>(
    () => ({
      anchor,
      lit,
      tracing: Boolean(traced),
      onTrace: (rid) => setTraced(traced === rid ? null : rid),
      open: path[path.length - 1] ?? null,
      onOpenRow,
    }),
    [anchor, lit, traced, setTraced, path, onOpenRow],
  );

  /* ── keyboard ─────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("textarea, input")) return;
      if (e.key === "Escape") {
        // Unwind one layer at a time: the trace first, then one level.
        if (traced) setTraced(null);
        else if (path.length) go(path.slice(0, -1));
      } else if (e.key === "0") {
        go([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [traced, setTraced, path, go]);

  const crumbs = path
    .map((_, i) => nodeAt(path.slice(0, i + 1)))
    .filter((n): n is Node => n !== null)
    .map((n) => ({ id: n.id, title: n.title, step: stepOf(n.id) }));

  const open = (next: string[]) => go(next);

  return (
    <div className="flex h-dvh w-screen overflow-hidden bg-warm-cream">
      <Trail
        repo={RUN.repo}
        meta={`${RUN.files} files · ${RUN.commit}`}
        crumbs={crumbs}
        onJump={(d) => go(path.slice(0, d))}
      />
      <main ref={scrollRef} className="dotfield relative min-w-0 flex-1 overflow-y-auto">
        <div ref={contentRef} className="relative mx-auto max-w-[1220px] px-10 pb-28 pt-9">
          <WireLayer
            canvasRef={contentRef}
            nodes={nodes}
            wires={wires}
            version={version}
            reflowKey={key}
          />
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={key}
              custom={dir}
              variants={{
                in: { opacity: 1, y: 0 },
                out: (d: number) => ({ opacity: 0, y: 10 * d }),
                gone: (d: number) => ({ opacity: 0, y: -6 * d }),
              }}
              initial="out"
              animate="in"
              exit="gone"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              {focus ? (
                <Level node={focus} path={path} ctx={ctx} onOpen={open} />
              ) : (
                <Overview onOpen={open} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}


/* ── levels ──────────────────────────────────────────────────── */

/**
 * The repo itself, drawn as a level like any other: the filer's path as a
 * numbered line, and the roots E0 never touches grouped under their own
 * heading.
 */
function Overview({ onOpen }: { onOpen: (p: string[]) => void }) {
  const chain = CHAIN.map((id) => L0.find((n) => n.id === id)).filter(
    (n): n is Node => n !== undefined,
  );
  const outside = L0.filter((n) => !CHAIN.includes(n.id));

  return (
    <>
      <Header
        eyebrow="Repository"
        title={RUN.repo}
        sub={RUN.about}
        meta={`${RUN.files} files · commit ${RUN.commit}`}
      />
      <Caption count={chain.length} what="steps" how="in order" />
      <Steps nodes={chain} edges={E0} at={[]} onOpen={onOpen} />

      {outside.length ? (
        <section className="mt-12">
          <Caption count={outside.length} what="more" how="outside the path" />
          <Note>No step leads to these.</Note>
          <Grid nodes={outside} at={[]} onOpen={onOpen} />
        </section>
      ) : null}
    </>
  );
}

/**
 * One open node. Its own picture and paragraph are the header; below, either
 * its parts — named, not opened — or, at the bottom of a branch, its own rows
 * at full width, down to the code.
 *
 * A level shows ONE step of depth. Cards used to carry their own diagram,
 * steps and facts, so opening a node put two levels on screen and the next
 * click felt like a jump. Now nothing appears before you have opened the level
 * it belongs to.
 */
function Level({
  node,
  path,
  ctx,
  onOpen,
}: {
  node: Node;
  path: string[];
  ctx: RowCtx;
  onOpen: (p: string[]) => void;
}) {
  const kids = authored(node);
  const parent = path.length > 1 ? nodeAt(path.slice(0, -1)) : null;
  const step = path.length === 1 ? stepOf(node.id) : undefined;
  const note = setNote(node);
  const sequence = node.group?.ordering === "sequence";

  return (
    <>
      <Header
        back={{
          label: parent?.title ?? RUN.repo,
          onClick: () => onOpen(path.slice(0, -1)),
        }}
        eyebrow={
          parent
            ? `Inside ${parent.title}`
            : step
              ? `Step ${step} of ${CHAIN.length}`
              : "Outside the path"
        }
        title={node.title}
        state={node.state}
        alarm={node.alarm}
        // A row-built node's fallback sub is "Inside <parent>", which the
        // eyebrow already says.
        sub={node.sub === `Inside ${parent?.title}` ? undefined : node.sub}
        detail={node.detail}
        meta={
          node.footprint
            ? `${node.footprint.dirs.join("  ")}  ·  ${node.footprint.files} files`
            : node.evidence
        }
        shape={node.shape}
      />

      {kids.length ? (
        <>
          <Caption
            count={kids.length}
            what="parts"
            how={sequence ? "in order" : "no order between them"}
          />
          {note ? <Note>{note}</Note> : null}
          {sequence ? (
            <Steps nodes={kids} edges={siblingEdges(node, kids)} at={path} onOpen={onOpen} />
          ) : (
            <Grid nodes={kids} at={path} onOpen={onOpen} />
          )}
        </>
      ) : node.anatomy?.length ? (
        // Full width at last: the rows get their answers here, and a `source`
        // block gets room to be read and edited. Anatomy is typeset for a
        // 340px card (11px rows); zoom lifts it to reading size under a 28px
        // title without forking every block's type scale.
        <div className="max-w-[900px] [zoom:1.18]">
          <AnatomyView owner={node.id} blocks={node.anatomy} ctx={ctx} opened />
        </div>
      ) : null}
    </>
  );
}

/* ── layout ──────────────────────────────────────────────────── */

/**
 * Real order, drawn as one numbered line down the left — the same rail the
 * steps inside a flow use. It never wraps, so there is no row-end arrow
 * pointing at nothing. Where the data names the hand-off ("uploads to") it is
 * written on the line; where the hand-off is only partly established the line
 * is dashed.
 */
function Steps({
  nodes,
  edges,
  at,
  onOpen,
}: {
  nodes: Node[];
  edges: Edge[];
  at: string[];
  onOpen: (p: string[]) => void;
}) {
  return (
    <ol className="flex max-w-[880px] flex-col">
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        const edge = last
          ? undefined
          : edges.find((e) => e.from === n.id && e.to === nodes[i + 1].id);
        const partial = edge && edge.state !== "derived";
        return (
          <li key={n.id} className="flex gap-4">
            <div className="flex w-[22px] shrink-0 flex-col items-center pt-[15px]">
              <StepDot n={i + 1} state={n.state} />
              {last ? null : (
                <span
                  className={cn(
                    "mt-1.5 w-0 flex-1 border-l",
                    partial ? "border-dashed border-amber-line" : "border-border-strong",
                  )}
                />
              )}
            </div>
            <div className={cn("min-w-0 flex-1", last ? "" : "pb-3")}>
              <Row node={n} at={at} onOpen={onOpen} />
              {edge?.label ? (
                <p
                  className={cn(
                    "mt-2.5 pl-1 text-[11.5px] italic",
                    partial ? "text-amber-ink" : "text-faint",
                  )}
                >
                  {edge.label} {nodes[i + 1].title}
                </p>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** A set has no order, so it gets no numbers and no line — a grid. */
function Grid({
  nodes,
  at,
  onOpen,
}: {
  nodes: Node[];
  at: string[];
  onOpen: (p: string[]) => void;
}) {
  return (
    <div className="grid max-w-[1100px] grid-cols-[repeat(auto-fill,minmax(340px,1fr))] gap-3">
      {nodes.map((n) => (
        <Row key={n.id} node={n} at={at} onOpen={onOpen} />
      ))}
    </div>
  );
}

function Caption({ count, what, how }: { count: number; what: string; how: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <Eyebrow className="text-muted-slate">
        {count} {what}
      </Eyebrow>
      <span className="font-mono text-[10.5px] text-faint">· {how}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="-mt-1 mb-4 text-[12px] italic text-faint">{children}</p>;
}

/* ── the node you are in ─────────────────────────────────────── */

function Header({
  back,
  eyebrow,
  title,
  state,
  alarm,
  sub,
  detail,
  meta,
  shape,
}: {
  /** The level above, named — so "back" says where it goes. */
  back?: { label: string; onClick: () => void };
  eyebrow: string;
  title: string;
  state?: Node["state"];
  alarm?: boolean;
  sub?: string;
  detail?: string;
  meta?: string;
  shape?: Shape;
}) {
  return (
    <header className="mb-8 flex items-start gap-10 border-b border-border-gray pb-7">
      <div className="min-w-0 max-w-[660px] flex-1">
        {back ? (
          <button
            onClick={back.onClick}
            className="-ml-2 mb-4 flex items-center gap-1.5 rounded-full px-2 py-1 text-[12.5px] text-muted-slate transition-colors hover:bg-surface-container-low hover:text-ink focus-visible:outline-2 focus-visible:outline-deep-green"
          >
            <span aria-hidden>←</span>
            {back.label}
          </button>
        ) : null}
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="mt-2.5 flex items-center gap-3">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {state ? <StateChip state={state} alarm={alarm} /> : null}
        </div>
        {sub ? (
          <p className="mt-1.5 text-[15px] leading-snug text-on-surface-variant">{sub}</p>
        ) : null}
        {/* The one paragraph on the screen: this is the node you opened, so
            its prose has been asked for (D24). */}
        {detail ? (
          <p className="mt-4 text-[13.5px] leading-relaxed text-on-surface">{detail}</p>
        ) : null}
        {meta ? (
          <p className="mt-4 whitespace-pre-wrap font-mono text-[11px] text-faint">{meta}</p>
        ) : null}
      </div>
      {/* The picture of how this level's parts fit together. It lives here,
          not on the cards below, because it is about all of them. */}
      {shape ? (
        <div className="w-[300px] shrink-0 self-center">
          <ShapeView shape={shape} />
        </div>
      ) : null}
    </header>
  );
}

/* ── a part: named, not opened ───────────────────────────────── */

const BLOCK_NOUN: Record<string, string> = {
  flow: "steps",
  facts: "facts",
  map: "entries",
  schema: "columns",
  routes: "routes",
  chips: "kinds",
  bars: "measures",
  parts: "parts",
};

/**
 * What is behind the click, in a few words: the author's own `summary` when
 * there is one, else the names of the parts, else a count of what kind of
 * thing is inside — and whether real code is at the bottom of it.
 */
function inside(node: Node): string {
  if (node.summary) return node.summary;
  const kids = authored(node);
  if (kids.length) return kids.map((k) => k.title).join(" · ");
  const bits: string[] = [];
  let code = 0;
  for (const b of node.anatomy ?? []) {
    if (b.kind === "source") code++;
    else bits.push(`${b.rows.length} ${BLOCK_NOUN[b.kind]}`);
  }
  if (code) bits.push(code === 1 ? "code" : `${code} code excerpts`);
  return bits.join(" · ");
}

/**
 * One part of the level: what it is, in a line, and what you will find if you
 * open it. Never its contents — those are the next step down.
 */
function Row({ node, at, onOpen }: { node: Node; at: string[]; onOpen: (p: string[]) => void }) {
  const go = openable(node) ? () => onOpen([...at, node.id]) : undefined;
  const where = node.evidence ?? node.footprint?.dirs.join("  ");
  const peek = inside(node);
  const count = node.shape?.kind === "count" ? `${node.shape.value} ${node.shape.unit}` : null;

  return (
    <button
      data-node-id={node.id}
      onClick={go}
      disabled={!go}
      className={cn(
        "group flex w-full items-start gap-3 rounded-[12px] border bg-pure-white px-4 py-3 text-left transition-[border-color,box-shadow] duration-150",
        node.ghost ? "border-dashed border-border-strong bg-surface-container-low/60" : "border-border-gray",
        go && "hover:border-border-strong hover:shadow-panel",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {node.title}
          </span>
          <StateChip state={node.state} alarm={node.alarm} />
        </span>
        <span
          className="mt-0.5 block text-[13px] leading-snug text-on-surface-variant [display:-webkit-box] [overflow:hidden] [-webkit-box-orient:vertical]"
          style={{ WebkitLineClamp: BLURB_LINES }}
        >
          {node.sub}
        </span>
        {count || peek ? (
          <span className="mt-1.5 block truncate text-[11.5px] text-muted-slate">
            {[count, peek].filter(Boolean).join(" · ")}
          </span>
        ) : null}
        {where ? (
          <span className="mt-1 block truncate font-mono text-[10.5px] text-faint">{where}</span>
        ) : null}
      </span>
      {go ? (
        <span
          aria-hidden
          className="pt-0.5 text-[15px] text-faint transition-colors group-hover:text-deep-green"
        >
          ›
        </span>
      ) : null}
    </button>
  );
}

function StepDot({ n, state }: { n: number; state: Node["state"] }) {
  return (
    <span
      className={cn(
        "flex size-[22px] shrink-0 items-center justify-center rounded-full border font-mono text-[10.5px] font-semibold",
        state === "derived"
          ? "border-mint-line bg-mint-success text-deep-green"
          : "border-amber-line bg-amber-surface text-amber-ink",
      )}
    >
      {n}
    </span>
  );
}
