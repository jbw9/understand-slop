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
import { E0, L0, LINKS, RUN, levelAt, nodeAt } from "@/lib/taxbuddy";
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

/** Three steps and two arrows fit the content column on a laptop. */
const CARD_W = 340;
/** Room for the arrow between two steps of a sequence. */
const CONNECTOR_W = 44;

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
                <Overview ctx={ctx} onOpen={open} />
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
 * The repo itself, drawn as a level like any other. The roots split in two:
 * the filer's path, numbered in its real order, and everything E0 never
 * touches, grouped under its own heading rather than parked wherever the
 * serpentine left a gap.
 */
function Overview({ ctx, onOpen }: { ctx: RowCtx; onOpen: (p: string[]) => void }) {
  const chain = CHAIN.map((id) => L0.find((n) => n.id === id)).filter(
    (n): n is Node => n !== undefined,
  );
  const outside = L0.filter((n) => !CHAIN.includes(n.id));
  const card = (n: Node, step?: number) => (
    <Card node={n} at={[]} step={step} ctx={ctx} onOpen={onOpen} />
  );

  return (
    <>
      <Header
        eyebrow="Repository"
        title={RUN.repo}
        sub="Cut by what a filer does, in the order the product's own ONBOARDING_STEPS declares."
        meta={`${RUN.files} files · commit ${RUN.commit}`}
      />
      <Caption count={chain.length} what="steps" how="in order" />
      <Sequence nodes={chain} edges={E0} render={card} even />

      {outside.length ? (
        <section className="mt-14">
          <Caption count={outside.length} what="more" how="outside the path" />
          <p className="-mt-2 mb-4 text-[12px] italic text-faint">
            No step leads to these — a side door, the store underneath, and two stages nothing reaches.
          </p>
          <SetGrid nodes={outside} render={(n) => <Card node={n} at={[]} ctx={ctx} onOpen={onOpen} fill />} />
        </section>
      ) : null}
    </>
  );
}

/**
 * One open node: itself as the header, then either its children as cards or —
 * at the bottom of a branch — its own rows at full width, down to the code.
 * No node in the fixture has both, so the two never compete for the body.
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
  const card = (n: Node, s?: number) => (
    <Card node={n} at={path} step={s} ctx={ctx} onOpen={onOpen} />
  );
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
          {note ? <p className="-mt-2 mb-4 text-[12px] italic text-faint">{note}</p> : null}
          {sequence ? (
            <Sequence nodes={kids} edges={siblingEdges(node, kids)} render={card} />
          ) : (
            <SetGrid nodes={kids} render={(n) => <Card node={n} at={path} ctx={ctx} onOpen={onOpen} fill />} />
          )}
        </>
      ) : node.anatomy?.length ? (
        // Full width at last: the rows a card could only list as titles get
        // their answers here, and a `source` block gets room to be read and
        // edited.
        <div className="max-w-[820px]">
          <AnatomyView owner={node.id} blocks={node.anatomy} ctx={ctx} opened />
        </div>
      ) : null}
    </>
  );
}

/* ── layout ──────────────────────────────────────────────────── */

/**
 * Steps that wrap like text, left to right, every row. The arrow sits on the
 * left of each step after the first, so a row that wraps opens with the arrow
 * coming in — "continued" — instead of ending on one pointing at nothing.
 */
function Sequence({
  nodes,
  edges,
  render,
  even,
}: {
  nodes: Node[];
  edges: Edge[];
  render: (n: Node, step: number) => React.ReactNode;
  /**
   * Cards in a row share a height. Only where they are close to begin with —
   * on a deep level one card can be 4x its neighbour, and stretching would
   * just move the gap inside the short card.
   */
  even?: boolean;
}) {
  return (
    <ol className={cn("flex flex-wrap gap-y-8", even ? "items-stretch" : "items-start")}>
      {nodes.map((n, i) => {
        const edge = i
          ? edges.find((e) => e.from === nodes[i - 1].id && e.to === n.id)
          : undefined;
        return (
          <li key={n.id} className={cn("flex", even ? "items-stretch" : "items-start")}>
            {i ? <Connector edge={edge} /> : null}
            {render(n, i + 1)}
          </li>
        );
      })}
    </ol>
  );
}

/** A set has no order to preserve, so it packs into columns with no holes. */
function SetGrid({ nodes, render }: { nodes: Node[]; render: (n: Node) => React.ReactNode }) {
  return (
    <div className="columns-[340px] gap-7">
      {nodes.map((n) => (
        <div key={n.id} className="mb-7 break-inside-avoid">
          {render(n)}
        </div>
      ))}
    </div>
  );
}

/**
 * The arrow between two steps. Dashed and amber where the hand-off itself is
 * only partly established — "should gate" is not "gates". No edge, no arrow:
 * the gap stays, the claim does not.
 */
function Connector({ edge }: { edge?: Edge }) {
  const partial = edge && edge.state !== "derived";
  return (
    <span
      className="flex shrink-0 justify-center pt-[19px]"
      style={{ width: CONNECTOR_W }}
      title={edge?.label}
    >
      {edge ? (
        <svg width="30" height="10" viewBox="0 0 30 10" fill="none" aria-hidden="true">
          <path
            d="M1 5h26M23 1.5 27 5l-4 3.5"
            stroke={partial ? "var(--color-amber-ink)" : "var(--color-deep-green)"}
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={partial ? "3 3" : undefined}
          />
        </svg>
      ) : null}
    </span>
  );
}

function Caption({ count, what, how }: { count: number; what: string; how: string }) {
  return (
    <div className="mb-4 flex items-baseline gap-2">
      <Eyebrow className="text-muted-slate">
        {count} {what}
      </Eyebrow>
      <span className="font-mono text-[10.5px] text-faint">· {how}</span>
    </div>
  );
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
    <header className="mb-9 flex items-start gap-10 border-b border-border-gray pb-8">
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
            its prose has been asked for. Cards below stay menus (D24). */}
        {detail ? (
          <p className="mt-4 text-[13.5px] leading-relaxed text-on-surface">{detail}</p>
        ) : null}
        {meta ? (
          <p className="mt-4 whitespace-pre-wrap font-mono text-[11px] text-faint">{meta}</p>
        ) : null}
      </div>
      {shape ? (
        <div className="w-[300px] shrink-0 self-center">
          <ShapeView shape={shape} />
        </div>
      ) : null}
    </header>
  );
}

/* ── a card: what something contains, not the contents ───────── */

function Card({
  node,
  at,
  step,
  ctx,
  onOpen,
  fill,
}: {
  node: Node;
  /** The path of the level this card sits on. */
  at: string[];
  step?: number;
  /** Take the column's width (a set's grid) rather than the fixed step width. */
  fill?: boolean;
  ctx: RowCtx;
  onOpen: (p: string[]) => void;
}) {
  const here = [...at, node.id];
  const kids = authored(node);
  const sequence = node.group?.ordering === "sequence";
  const go = openable(node) ? () => onOpen(here) : undefined;
  const meta = node.evidence ?? node.footprint?.dirs.join("  ");
  // A figure on the repo level made one step three times its neighbour's
  // height. It is drawn in the header once the step is opened; marks and
  // counts are a line tall and stay.
  const shape = at.length === 0 && node.shape?.kind === "figure" ? undefined : node.shape;

  // Always a div, never a button: anatomy rows are buttons, and the parser
  // reparents nested interactive elements out of the card, detaching every
  // wire anchor inside it.
  return (
    <div
      ref={ctx.anchor(node.id) as never}
      data-node
      data-node-id={node.id}
      role={go ? "button" : undefined}
      tabIndex={go ? 0 : undefined}
      onClick={(e) => {
        // A row inside the card has its own job (trace, or open its level).
        if ((e.target as HTMLElement).closest("[data-row]")) return;
        go?.();
      }}
      onKeyDown={(e) => {
        if (go && e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          go();
        }
      }}
      style={{ width: fill ? "100%" : CARD_W }}
      className={cn(
        "flex max-w-full flex-col rounded-[14px] border bg-pure-white px-4 py-3.5 text-left transition-[border-color,box-shadow] duration-200",
        node.ghost ? "border-dashed border-border-strong bg-surface-container-low/60" : "border-border-gray",
        go && "cursor-pointer hover:border-border-strong hover:shadow-panel",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green",
      )}
    >
      <div className="flex items-center gap-2">
        {step ? <StepDot n={step} state={node.state} /> : null}
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
          {node.title}
        </span>
        <StateChip state={node.state} alarm={node.alarm} />
      </div>
      {/* Wraps to BLURB_LINES, never truncated (lib/view.ts). */}
      <p
        className="mt-1 font-mono text-[11.5px] leading-[1.4] text-faint [display:-webkit-box] [overflow:hidden] [-webkit-box-orient:vertical]"
        style={{ WebkitLineClamp: BLURB_LINES }}
      >
        {node.sub}
      </p>

      {shape || node.anatomy?.length || kids.length ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-border-gray pt-3">
          {shape ? <ShapeView shape={shape} /> : null}
          {node.anatomy?.length ? (
            <AnatomyView owner={node.id} blocks={node.anatomy} ctx={ctx} />
          ) : kids.length ? (
            <Menu
              kids={kids}
              numbered={sequence}
              onPick={(id) => onOpen([...here, id])}
            />
          ) : null}
        </div>
      ) : null}

      {meta ? <p className="mt-auto truncate pt-3 font-mono text-[10px] text-faint">{meta}</p> : null}
    </div>
  );
}

/**
 * What a branch card holds: its children by name, each one a door straight to
 * that child. Titles only — their own content is the level behind the click.
 */
function Menu({
  kids,
  numbered,
  onPick,
}: {
  kids: Node[];
  numbered: boolean;
  onPick: (id: string) => void;
}) {
  return (
    <ul className="-mx-1.5 flex flex-col">
      {kids.map((k, i) => (
        <li key={k.id}>
          <button
            data-row
            onClick={() => (openable(k) ? onPick(k.id) : undefined)}
            className="flex w-full items-center gap-2 rounded-[6px] px-1.5 py-[5px] text-left transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-deep-green"
          >
            {numbered ? (
              <StepDot n={i + 1} state={k.state} small />
            ) : (
              <span aria-hidden className="size-[5px] shrink-0 rounded-full bg-border-strong" />
            )}
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-ink">
              {k.title}
            </span>
            <StateChip state={k.state} alarm={k.alarm} />
            {openable(k) ? (
              <span aria-hidden className="text-[11px] text-faint">›</span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

function StepDot({ n, state, small }: { n: number; state: Node["state"]; small?: boolean }) {
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-mono font-semibold",
        small ? "size-[16px] text-[8.5px]" : "size-[20px] text-[10px]",
        state === "derived"
          ? "border-mint-line bg-mint-success text-deep-green"
          : "border-amber-line bg-amber-surface text-amber-ink",
      )}
    >
      {n}
    </span>
  );
}
