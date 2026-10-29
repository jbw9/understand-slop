"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AnatomyView, TableGlyph, type RowCtx } from "@/components/anatomy";
import { DocsList, Example, ExplainedBlock, WatchOut, isExplained, sectionOrder, sectionTone } from "@/components/blocks";
import { Building, DraftNote, Stages, isBuilding, useDrawIn } from "@/components/building";
import { CodePopup, ExplainToggle, Explainer, StartHere, parseAt, useExplain, type CodeFocus } from "@/components/explain";
import { InlineMarks, ShapeView } from "@/components/shapes";
import { Eyebrow, Glossary, OriginMark, Prose, StateChip } from "@/components/state";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { Zoom, useZoomScale } from "@/components/zoom";
import { Crumbs, goTo, useLocation } from "@/components/chrome";
import { Button, CodeIcon } from "@/components/button";
import { Menu } from "@/components/menu";
import { useMap } from "@/components/map-context";
import { useFlash } from "@/components/flash";
import { DocView, closeDoc, useOpenDoc } from "@/components/docs";
import { AgentIcon, CLAUDE, useAgents } from "@/components/agents";
import { handTo, openClaude, pick, section, sectionKey, usePicked, type Target } from "@/lib/context";
import { FixAndKeep, onAnswer } from "@/components/keep";
import { SectionTabs, openInTab } from "@/components/tabs";
import { BlockDiffView, RemovedSections, SectionTint, useBlockDiffs } from "@/components/diff";
import type { Exchange } from "@/lib/keep";
import { codeAt, describeElement, describeProblems, problemSpans, type BuiltMap } from "@/lib/map";
import { readSource } from "@/lib/source";
import { useSettings, type Ground } from "@/lib/settings";
import type { Anatomy, Edge, Node } from "@/lib/data";
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


/** Levels below this node: 0 for a leaf. */
function height(node: Node): number {
  return node.children?.length ? 1 + Math.max(...node.children.map(height)) : 0;
}

/**
 * File paths only at the bottom of a branch — the level you are standing on
 * when there is nowhere further to go (D42). A path on a card answers a
 * question nobody has asked yet: you can open the part and be told then. The
 * code drawer still names every file on every level, and the open level's own
 * header still shows its footprint.
 */
function nearBottom(node: Node) {
  return height(node) === 0;
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
  const map = useMap();
  const { LINKS, RUN, levelAt, nodeAt, name, maps } = map;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const { nodes, anchor, version } = useWireAnchors();
  // A rewrite of the map lights what it changed (components/flash.tsx).
  useFlash(contentRef);

  /**
   * The open path, root-first, read from the URL (useLocation in
   * components/chrome.tsx); depth is its length. Clicking empty space used to
   * go back, and an accidental click on the background threw away where you
   * were.
   */
  const { path, crumbs } = useLocation();
  // A doc opened over the level (components/docs.tsx) takes its place until closed.
  const doc = useOpenDoc();
  const key = doc ? `doc:${doc.file}` : path.join("/");
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
  }, [traced, LINKS]);

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
  }, [traced, lit, focus, path, LINKS, levelAt]);

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
      if (nodeAt([...at, id])) goTo([...at, id]);
    },
    [path, nodeAt],
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
        // Unwind one layer at a time: an open doc, the trace, then one level.
        if (doc) closeDoc();
        else if (traced) setTraced(null);
        else if (path.length) goTo(path.slice(0, -1));
      } else if (e.key === "0" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // ⌘0 belongs to the zoom reset, which listens on window too.
        goTo([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [traced, setTraced, path, doc]);

  /* ── handing a section to Claude ──────────────────────────── */

  // Right-click offers Claude the nearest thing under the pointer: a card or
  // the open level's header (`data-path`, a whole section), else a row, box,
  // block or line of code (`data-row`, `data-pick`). Desktop only: the browser
  // keeps its own menu, and there is no Claude tab to hand anything to.
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const { ground } = useSettings();
  const [menu, setMenu] = useState<{ x: number; y: number; target: Target; opens: string[] | null } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onContextMenu = (e: React.MouseEvent) => {
    // Anything else on the level — a caption, the space between blocks — is
    // part of the section you are in, so that is what it offers.
    const el = (e.target as Element).closest<HTMLElement | SVGElement>(PICKABLE);
    const target = el ? targetOf(map, el, path) : section(map, path);
    if (!target) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, target, opens: opensAt(e.target as Element, path) });
  };

  // A part opens in a new tab the way a link does: a middle click, or a click
  // with ⌘/Ctrl. Taken in the capture phase, before the part's own click opens
  // it in place.
  const toTab = (e: React.MouseEvent) => {
    const opens = opensAt(e.target as Element, path);
    if (!opens) return;
    e.preventDefault();
    e.stopPropagation();
    openInTab(name, opens);
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-warm-cream"
      onContextMenu={desktop ? onContextMenu : undefined}
      onClickCapture={(e) => (e.metaKey || e.ctrlKey ? toTab(e) : undefined)}
      onAuxClickCapture={(e) => (e.button === 1 ? toTab(e) : undefined)}
    >
      {menu ? <PickMenu {...menu} onClose={closeMenu} /> : null}
      <SectionTabs path={path} />
      <main
        ref={scrollRef}
        className={cn(GROUND[ground], "relative min-h-0 min-w-0 flex-1 overflow-auto")}
        // The level is laid out in what the workspace window leaves of the
        // width (components/workspace.tsx), but never in less than 480px: a
        // window dragged nearly full width covers the map rather than crushing it.
        style={{ paddingRight: "min(var(--workspace-inset, 0px), max(0px, 100% - 480px))" }}
      >
        {/* In the desktop app the title bar carries where you are. */}
        {desktop ? null : (
          <Crumbs repo={RUN.repo} map={name} maps={maps} crumbs={crumbs} onJump={(d) => goTo(path.slice(0, d))} />
        )}
        <Zoom scrollRef={scrollRef}>
        <div ref={contentRef} className="relative mx-auto max-w-[1680px] px-10 pb-28 pt-5">
          <ZoomedWires
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
              {doc ? (
                <DocView file={doc.file} line={doc.line} />
              ) : (
                <Level node={focus ?? map.TOP} path={path} ctx={ctx} onOpen={goTo} />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
        </Zoom>
      </main>
    </div>
  );
}


/** The wires measure in screen pixels, so they need the magnification they are drawn under. */
function ZoomedWires(props: Omit<Parameters<typeof WireLayer>[0], "scale">) {
  return <WireLayer {...props} scale={useZoomScale()} />;
}

const GROUND: Record<Ground, string> = { dots: "dotfield", squares: "gridfield", plain: "" };

const noSubscribe = () => () => {};

/**
 * The last answer Claude gave, so any level can offer to keep it. Held here
 * rather than per level: the reader asks from one level and may well want it on
 * the one they moved to, and a level unmounting must not forget it.
 */
function useLatestAnswer(): Exchange | null {
  const [answer, setAnswer] = useState<Exchange | null>(null);
  useEffect(() => onAnswer(setAnswer), []);
  return answer;
}

const PICKABLE = "[data-path], [data-row], [data-pick]";

/**
 * The level a clicked element leads to, if it leads anywhere but here: a part's
 * card (`data-path`) or a diagram box, whose href is that part's own URL.
 */
function opensAt(el: Element, here: string[]): string[] | null {
  const link = el.closest("a[href]");
  const href = link?.getAttribute("href");
  const at = href?.startsWith("?")
    ? new URLSearchParams(href).getAll("at")
    : (() => {
        const card = el.closest<HTMLElement | SVGElement>("[data-path]");
        return card?.dataset.path ? (JSON.parse(card.dataset.path) as string[]) : null;
      })();
  return at && at.join("/") !== here.join("/") ? at : null;
}

/**
 * What a right-clicked element hands to Claude. An element's words are what
 * is on screen — `data-pick-text` where the screen leaves something out, like
 * a table row's column names — and its code is the nearest `data-pick-code`.
 */
function targetOf(map: BuiltMap, el: HTMLElement | SVGElement, level: string[]): Target | null {
  const d = el.dataset;
  if (d.path !== undefined) {
    const at: string[] = JSON.parse(d.path);
    return at.length && !map.nodeAt(at) ? null : section(map, at);
  }
  const shown = ("innerText" in el ? el.innerText : (el.textContent ?? "")).trim();
  const label = (d.pick || shown.split("\n")[0] || "").trim().slice(0, 80);
  if (!label) return null;
  const id = d.row ?? d.pick ?? label;
  return {
    key: `${sectionKey(level)}#${id}`,
    title: label,
    text: describeElement(map, level, label, d.pickText ?? shown, el.closest<HTMLElement>("[data-pick-code]")?.dataset.pickCode),
  };
}

function PickMenu({
  x,
  y,
  target,
  opens,
  onClose,
}: {
  x: number;
  y: number;
  target: Target;
  /** The level the thing under the pointer opens, offered in a new tab. */
  opens: string[] | null;
  onClose: () => void;
}) {
  const { name } = useMap();
  const status = usePicked(target.key);
  return (
    <Menu
      x={x}
      y={y}
      title={target.title}
      onClose={onClose}
      items={[
        ...(opens ? [{ label: "Open in new tab", onClick: () => openInTab(name, opens) }] : []),
        status === "queued"
          ? { label: "Waiting for your next prompt", disabled: true }
          : { label: status === "sent" ? "Send to Claude again" : "Add to Claude context", onClick: () => pick(target) },
        {
          label: "Add and open Claude",
          onClick: () => {
            if (status !== "queued") pick(target);
            openClaude();
          },
        },
      ]}
    />
  );
}

/**
 * Asks the default agent (Settings) about a section's problems, all of them,
 * straight away: Claude takes them as context with the question, and the
 * button follows them there; another agent gets them in its prompt with the
 * question, sent. Desktop only, where the agents run.
 */
function HandProblems({ node, path }: { node: Node; path: string[] }) {
  const map = useMap();
  const { main } = useAgents();
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const key = `${sectionKey(path)}#problems`;
  const status = usePicked(key);
  const [pasted, setPasted] = useState(false);
  useEffect(() => {
    if (!pasted) return;
    const timer = setTimeout(() => setPasted(false), 2500);
    return () => clearTimeout(timer);
  }, [pasted]);
  if (!desktop) return null;
  const claude = main.id === CLAUDE.id;
  const label = claude
    ? status === "queued"
      ? "Asking Claude…"
      : status === "sent"
        ? "Sent to Claude — ask again"
        : "Ask Claude"
    : pasted
      ? `Sent to ${main.label}`
      : `Ask ${main.label}`;
  return (
    <Button
      size="sm"
      tone="alarm"
      icon={<AgentIcon id={main.id} />}
      disabled={claude && status === "queued"}
      onClick={async () => {
        // The code goes along, so the agent answers from it instead of
        // spending calls finding it; a file it cannot read is left out.
        const read = await Promise.all(
          problemSpans(map, path).map(async (s) => {
            const r = await readSource({ map: map.name, ...s }).catch(() => null);
            return r && "slice" in r ? { ...s, end: s.start + r.slice.code.split("\n").length - 1, code: r.slice.code } : null;
          }),
        );
        const source = read.filter((s) => s !== null);
        handTo(
          main.id,
          { key, title: `Problems in ${node.title}`, text: describeProblems(map, path, source) },
          source.length
            ? `Look into the problems in "${node.title}" from the map. The code each one points at is attached: check each against it, explain what goes wrong, and suggest a fix. Read more of the repo only if what is attached is not enough.`
            : `Look into the problems in "${node.title}" from the map: check each against the code, explain what goes wrong, and suggest a fix.`,
        );
        if (!claude) setPasted(true);
      }}
      title={
        claude
          ? "Asks Claude about every problem here, with its section and code"
          : `Asks ${main.label} about every problem here, with its section and code`
      }
    >
      {label}
    </Button>
  );
}

/** What a whole block is called when it is handed over. */
function blockLabel(b: Anatomy): string {
  if ("caption" in b && b.caption) return b.caption;
  if (b.kind === "screen") return `The ${b.title} screen`;
  if (b.kind === "schema") return `The ${b.table} table`;
  if (b.kind === "source") return b.file;
  return BLOCK_NOUN[b.kind] ? `The ${BLOCK_NOUN[b.kind]}` : b.kind;
}

/* ── levels ──────────────────────────────────────────────────── */

/**
 * One open node, explained. Top to bottom: what it is (header), the picture of
 * how it fits together, its own data — tables, screens, who talks to whom —
 * then its parts to go deeper, what to watch out for, and last, folded, the
 * code (D34).
 *
 * A level still shows ONE step of depth: a part below is named, never opened
 * in place (D31). What changed is that the open level itself now carries
 * enough to be understood without reading the code.
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
  const map = useMap();
  const { RUN, nodeAt } = map;
  const kids = authored(node);
  const parent = path.length > 1 ? nodeAt(path.slice(0, -1)) : null;
  // The empty path is the repository itself (D60): nothing above it to go back to.
  const top = path.length === 0;
  const note = setNote(node);
  const sequence = node.group?.ordering === "sequence";
  const figure = node.shape?.kind === "figure" ? node.shape : undefined;
  const blocks = node.anatomy ?? [];
  // Which parts a box on this level's diagram already opens — those drive the
  // list below down to a quiet index (D40).
  const onDiagram = new Set(
    blocks
      .flatMap((b) => (b.kind === "diagram" ? b.boxes : []))
      .map((box) => box.opens)
      .filter((id): id is string => Boolean(id) && kids.some((k) => k.id === id)),
  );
  // The order the picture assigns its section hues, so the list below can
  // carry the same ones. Taken from the first diagram that leads anywhere —
  // the same one whose boxes the reader just looked at.
  // A box may open a row-built child too (check.ts allows it), so owning is
  // tested against every child, not only the authored ones listed below.
  const owns = (id: string) => Boolean(node.children?.some((k) => k.id === id));
  const hueOrder = sectionOrder(
    blocks.find(
      (b): b is Extract<Anatomy, { kind: "diagram" }> =>
        b.kind === "diagram" && b.boxes.some((x) => x.opens && owns(x.opens)),
    ) ?? { kind: "diagram", caption: "", boxes: [], arrows: [] },
    owns,
  );
  // The code is the last layer: a level with parts below it points down at
  // them, and only a level with nothing below it shows its lines — opened
  // over the page from the step that explains them, or all at once from the
  // header, never listed under the level (D68).
  const code = node.children?.length ? [] : codeAt(map, path);
  const [codeFocus, setCodeFocus] = useState<CodeFocus | null>(null);
  const showStep = (at: string, heading: string, detail?: string) => {
    const ref = parseAt(at);
    if (ref) setCodeFocus({ heading, detail, refs: [ref] });
  };
  const levelCtx: RowCtx = { ...ctx, onStepCode: showStep };
  const [explainOn] = useExplain();
  // Only a map made with the plain-words layer offers the toggle.
  const explains = Boolean(map.OVERVIEW?.explain || map.L0.some((r) => r.explain));
  const trail = [RUN.repo, ...path.map((_, i) => nodeAt(path.slice(0, i + 1))?.title ?? "")];
  const answer = useLatestAnswer();
  // Empty outside diff mode, so the block render below is unchanged then.
  const blockDiffs = useBlockDiffs(path);
  // Two or more data shapes (a table, a file's fields, a stored value) are one
  // section of names, each opening its own body, instead of a stack of full
  // cards. Not in a diff that touches one: the red and green must be on screen.
  const shapes = blocks.flatMap((b, i) => (b.kind === "schema" || b.kind === "example" ? [i] : []));
  const grouped = shapes.length > 1 && !shapes.some((i) => blockDiffs.has(i));
  // A map still being made (D69): until its overview lands the repository's
  // level is the run itself, and a root still being checked is a draft.
  const run = top && isBuilding(map.progress, Boolean(map.OVERVIEW)) ? map.progress : undefined;
  const [watched, setWatched] = useState(false);
  if (run && !watched) setWatched(true);
  const column = useRef<HTMLDivElement>(null);
  useDrawIn(column, top && watched && !run);
  const draft = !top && Boolean(nodeAt(path.slice(0, 1))?.draft);

  return (
    <Glossary.Provider value={explainOn ? (map.OVERVIEW?.glossary ?? []) : []}>
      <Header
        path={path}
        back={
          top
            ? undefined
            : path.slice(0, -1).reduce(
                (crumbs, _, i) => [...crumbs, { label: nodeAt(path.slice(0, i + 1))?.title ?? "", onClick: () => onOpen(path.slice(0, i + 1)) }],
                [{ label: RUN.repo, onClick: () => onOpen([]) }],
              )
        }
        eyebrow={top ? "Repository" : `Inside ${parent?.title ?? RUN.repo}`}
        title={node.title}
        state={node.state}
        origin={node.origin}
        alarm={node.alarm}
        // A row-built node's fallback sub is "Inside <parent>", which the
        // eyebrow already says.
        sub={node.sub === `Inside ${parent?.title}` ? undefined : node.sub}
        detail={node.detail}
        unsure={node.state === "derived" ? undefined : node.unsure}
        meta={
          top
            ? RUN.commit ? `${RUN.files} files · commit ${RUN.commit}` : undefined
            : !nearBottom(node)
            ? undefined
            : node.footprint
              ? `${node.footprint.dirs.join("  ")}  ·  ${node.footprint.files} files`
              : node.evidence
        }
        link={top && RUN.url && RUN.commit ? { href: `${RUN.url}/tree/${RUN.commit}`, label: `${RUN.url.replace(/^https:\/\//, "")} ↗` } : undefined}
        shape={figure ? undefined : node.shape}
        onCode={code.length ? () => setCodeFocus({ heading: `The code behind ${node.title}`, refs: code }) : undefined}
        actions={
          <>
            {explains ? <ExplainToggle /> : null}
            <FixAndKeep path={path} answer={answer} />
          </>
        }
      />

      {/* One hairline between every block, the full width of the level, so it
          is plain where one thing ends and the next begins — a picture under
          a table is its own thing, not more of the table. Each block's width
          cap is on an inner box, so the line never stops at a ragged edge. */}
      {draft ? (
        <div className="mb-8">
          <DraftNote detail={map.progress?.roots.find((r) => r.id === path[0])?.detail} />
        </div>
      ) : null}
      <div
        ref={column}
        className={cn("flex flex-col [&>*+*]:mt-10 [&>*+*]:border-t [&>*+*]:border-border-gray [&>*+*]:pt-10", draft && "opacity-60")}
      >
        {run ? <Building progress={run} onOpen={onOpen} /> : null}
        {top && !run && map.progress && map.progress.stage !== "done" ? <Stages progress={map.progress} /> : null}
        {/* For a reader new to all of this: the level in plain words, before
            any of the terse parts. */}
        {explainOn && node.explain ? <Explainer owner={node.id} explain={node.explain} ctx={levelCtx} /> : null}

        {/* The picture is the main thing on the level, not a thumbnail in
            the header's corner. */}
        {figure && !run ? (
          <div data-pick="The picture">
            <div className="max-w-[540px]">
              <ShapeView shape={figure} />
            </div>
          </div>
        ) : null}

        {(run ? [] : blocks).map((b, i) =>
          grouped && shapes.includes(i) ? (
            i === shapes[0] ? (
              <DataShapes key={i} owner={node.id} blocks={shapes.map((j) => blocks[j] as DataBlock)} ctx={levelCtx} />
            ) : null
          ) : blockDiffs.has(i) ? (
            <div key={i} data-pick={blockLabel(b)}>
              <div className={b.kind === "diagram" ? "" : "max-w-[1100px]"}>
                <BlockDiffView block={b} diff={blockDiffs.get(i)!} />
              </div>
            </div>
          ) : isExplained(b) ? (
            <div key={i} data-pick={blockLabel(b)}>
              <div className={b.kind === "diagram" ? "" : "max-w-[1100px]"}>
                <ExplainedBlock
                  block={b}
                  onOpen={(id) =>
                    owns(id) ? onOpen([...path, id]) : undefined
                  }
                  hrefFor={(id) =>
                    `?${[...path, id].map((p) => `at=${encodeURIComponent(p)}`).join("&")}`
                  }
                  onCode={showStep}
                />
              </div>
            </div>
          ) : (
            // The older blocks are typeset for a 340px card (11px rows); zoom
            // lifts them to reading size without forking their type scale.
            <div key={i} data-pick={blockLabel(b)}>
              <div className="max-w-[900px] [zoom:1.18]">
                <AnatomyView owner={node.id} blocks={[b]} ctx={levelCtx} />
              </div>
            </div>
          ),
        )}

        {/* When every part is a box on the picture, the picture is the list. */}
        {kids.length && onDiagram.size < kids.length && !run ? (
          <section>
            <Caption
              count={kids.length}
              what={kids.length === 1 ? "part" : "parts"}
              how={
                onDiagram.size
                  ? `${onDiagram.size} of them on the picture above`
                  : sequence
                    ? "in order — open one to go deeper"
                    : "open one to go deeper"
              }
            />
            {note ? <Note>{note}</Note> : null}
            {sequence ? (
              <Steps nodes={kids} edges={siblingEdges(node, kids)} at={path} onOpen={onOpen} />
            ) : onDiagram.size ? (
              // The picture is the way down, so the list stops competing with
              // it: names and problems, no cards, no blurbs, no paths (D40).
              <List nodes={kids} at={path} onOpen={onOpen} hue={hueOrder} />
            ) : (
              <Grid nodes={kids} at={path} onOpen={onOpen} />
            )}
          </section>
        ) : null}

        {/* A part the commit deleted stays on screen, in red: the whole point
            of a diff is seeing what went, beside what replaced it. Outside the
            parts section, because a level whose only part was deleted has no
            parts left to hang it under — and that is when it matters most.
            Renders nothing when there are none, diff mode or not. */}
        <RemovedSections path={path} />

        {/* The repository's way in comes after its picture: the walkthrough
            opens parts the reader has just seen drawn. */}
        {explainOn && top && !run && (map.OVERVIEW?.walkthrough || map.OVERVIEW?.glossary?.length) ? (
          <StartHere walkthrough={map.OVERVIEW.walkthrough} glossary={map.OVERVIEW.glossary} onOpen={onOpen} />
        ) : null}

        {node.issues?.length ? (
          <div>
            <div className="max-w-[820px]">
              <WatchOut issues={node.issues} action={<HandProblems node={node} path={path} />} />
            </div>
          </div>
        ) : null}

        {node.docs?.length ? (
          <div>
            <div className="max-w-[820px]">
              <DocsList refs={node.docs} />
            </div>
          </div>
        ) : null}

      </div>

      {codeFocus ? (
        <CodePopup focus={codeFocus} trail={trail} owner={node.id} ctx={ctx} onClose={() => setCodeFocus(null)} />
      ) : null}
    </Glossary.Provider>
  );
}

/* ── data shapes ─────────────────────────────────────────────── */

type DataBlock = Extract<Anatomy, { kind: "schema" | "example" }>;

/** A shape's name, what it is in a few words, and how much is inside. */
function shapeLabel(b: DataBlock): { name: string; gloss?: string; size: string } {
  if (b.kind === "schema") {
    const file = /\.\w+$/.test(b.table);
    return { name: b.table, size: `${b.rows.length} ${file ? "fields" : "columns"}` };
  }
  const [name, ...rest] = b.caption.split(" — ");
  return { name, gloss: rest.join(" — ") || undefined, size: "example" };
}

/**
 * The level's data shapes, listed by name; each opens in place to its fields
 * or its example, the way the code drawer's places do.
 */
function DataShapes({ owner, blocks, ctx }: { owner: string; blocks: DataBlock[]; ctx: RowCtx }) {
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  const labels = blocks.map(shapeLabel);
  const what = labels.every((l) => /\.\w+$/.test(l.name))
    ? "files"
    : blocks.every((b) => b.kind === "schema")
      ? "tables"
      : "shapes of data";
  const toggle = (i: number) =>
    setOpen((was) => {
      const next = new Set(was);
      if (!next.delete(i)) next.add(i);
      return next;
    });
  return (
    <section>
      <Caption count={blocks.length} what={what} how="open one to see what is in it" />
      <ul className="flex max-w-[1100px] flex-col gap-2">
        {blocks.map((b, i) => {
          const { name, gloss, size } = labels[i];
          const shown = open.has(i);
          return (
            <li key={i} data-pick={blockLabel(b)} className="overflow-hidden rounded-[3px] border border-border-gray bg-pure-white">
              <button
                onClick={() => toggle(i)}
                aria-expanded={shown}
                className="flex w-full items-baseline gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container-low"
              >
                <span className="self-center">{b.kind === "schema" ? <TableGlyph /> : <ExampleGlyph />}</span>
                <span className="shrink-0 font-mono text-[13px] font-semibold text-ink">{name}</span>
                {gloss ? <span className="min-w-0 truncate text-[13px] text-on-surface-variant">{gloss}</span> : null}
                <span className="ml-auto shrink-0 font-mono text-[11px] text-faint">{size}</span>
                <span aria-hidden className="text-[11px] text-faint">{shown ? "▾" : "▸"}</span>
              </button>
              {shown ? (
                <div className="border-t border-border-gray">
                  {b.kind === "schema" ? (
                    // The schema rows are typeset for a 340px card; zoom lifts them as elsewhere on a level.
                    <div className="[zoom:1.18]">
                      <AnatomyView owner={owner} blocks={[b]} ctx={ctx} headless />
                    </div>
                  ) : (
                    <div className="p-3">
                      <Example block={b} bare />
                    </div>
                  )}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** A page with lines: a stored value, as the table glyph is a table. */
function ExampleGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M2.5 1.5h5l2 2v7h-7z" stroke="currentColor" strokeWidth="1" strokeLinejoin="round" className="text-muted-slate" />
      <path d="M4 6h4M4 8h3" stroke="currentColor" strokeWidth="1" className="text-muted-slate" />
    </svg>
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
        <SectionTint key={n.id} path={[...at, n.id]}>
          <Row node={n} at={at} onOpen={onOpen} />
        </SectionTint>
      ))}
    </div>
  );
}

/**
 * The parts as an index, for when the diagram above is already the way down
 * (D40). One line each: the name, and a problem count if there is one. No
 * blurb, no block counts, no file path — the picture carries the shape of the
 * level, and this is here so a part is still reachable by keyboard, by screen
 * reader, and when a part has no box of its own.
 */
function List({
  nodes,
  at,
  onOpen,
  hue = [],
}: {
  nodes: Node[];
  at: string[];
  onOpen: (p: string[]) => void;
  /** The order the picture above assigned its section hues, by node id. */
  hue?: string[];
}) {
  return (
    <ul className="max-w-[560px]">
      {nodes.map((n) => {
        const go = openable(n) ? () => onOpen([...at, n.id]) : undefined;
        const sec = hue.indexOf(n.id);
        return (
          <li key={n.id}>
            <button
              data-node-id={n.id}
              data-path={JSON.stringify([...at, n.id])}
              onClick={go}
              disabled={!go}
              className={cn(
                "group flex w-full items-center gap-2.5 rounded-[2px] border-b border-border-gray/70 px-1.5 py-2.5 text-left transition-colors",
                go && "hover:bg-surface-container-low",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green",
              )}
            >
              {/* The same hue the box carries upstairs. A part with no box
                  of its own gets no dot rather than a colour that matches
                  nothing — 3 of 13 levels have one. */}
              <span
                aria-hidden
                className={cn("size-[9px] shrink-0 rounded-full", sec < 0 && "opacity-0")}
                style={sec >= 0 ? { background: sectionTone(sec).ink } : undefined}
              />
              <span className="truncate text-[14px] font-medium tracking-[-0.01em] text-ink">
                {n.title}
              </span>
              {n.issues?.length ? (
                <span className="shrink-0 font-mono text-[10.5px] text-clay-ink">
                  ⚠ {n.issues.length}
                </span>
              ) : null}
              <span className="flex-1" />
              {go ? (
                <span
                  aria-hidden
                  className="shrink-0 text-[14px] text-faint transition-colors group-hover:text-deep-green"
                >
                  ›
                </span>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Caption({ count, what, how }: { count: number; what: string; how: string }) {
  return (
    <div className="mb-3 flex items-baseline gap-2">
      <Eyebrow className="text-muted-slate">
        {count} {what}
      </Eyebrow>
      <span className="text-[12px] text-faint">· {how}</span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="-mt-1 mb-4 text-[12px] italic text-faint">{children}</p>;
}

/* ── the node you are in ─────────────────────────────────────── */

function Header({
  path,
  back,
  eyebrow,
  title,
  state,
  origin,
  alarm,
  sub,
  detail,
  unsure,
  meta,
  link,
  shape,
  onCode,
  actions,
}: {
  /** Where this level is, so it can be handed to Claude from its header. */
  path: string[];
  /** The level above, named — so "back" says where it goes. */
  back?: { label: string; onClick: () => void }[];
  eyebrow: string;
  title: string;
  state?: Node["state"];
  /** Set where the reader rewrote this level's own words (lib/overlay.ts). */
  origin?: Node["origin"];
  alarm?: boolean;
  sub?: string;
  detail?: string;
  /** Why this level is not certain, shown with the mark it explains. */
  unsure?: string;
  meta?: string;
  /** Where the code lives, outside this page. */
  link?: { href: string; label: string };
  shape?: Shape;
  onCode?: () => void;
  /** What the reader can do to this level itself: keep an answer, fix it. */
  actions?: React.ReactNode;
}) {
  return (
    <header data-path={JSON.stringify(path)} className="mb-8 border-b border-border-gray pb-7">
      {/* One toolbar row: the way back on the left, what you can do to this
          level on the right. They used to be a back link here and a column of
          mismatched buttons in a rail beside the prose, which read as parts
          from different apps (D62). */}
      <div className="mb-5 flex min-h-7 flex-wrap items-center gap-2">
        {/* The whole way down, each step a way back to it, so a level always
            says what it is part of; the last is the one Esc goes back to. */}
        {back?.map((crumb, i) => (
          <Fragment key={i}>
            {i > 0 ? <span aria-hidden className="text-muted-slate">›</span> : null}
            <Button
              variant="ghost"
              onClick={crumb.onClick}
              className={`${i === 0 ? "-ml-2.5" : ""} text-muted-slate`}
              title={i === back.length - 1 ? "Back (Esc)" : undefined}
            >
              {i === 0 ? <span aria-hidden>←</span> : null}
              {crumb.label}
            </Button>
          </Fragment>
        ))}
        <span className="flex-1" />
        {onCode ? (
          <Button onClick={onCode} icon={<CodeIcon />}>
            View the code
          </Button>
        ) : null}
        {actions}
      </div>
      <div className="max-w-[720px]">
        <Eyebrow>{eyebrow}</Eyebrow>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">
            {title}
          </h1>
          {state ? <StateChip state={state} alarm={alarm} /> : null}
          {/* Beside the state mark, never instead of it: the two answer
              different questions (see `Origin` in lib/data.ts). */}
          {origin ? <OriginMark origin={origin} /> : null}
          {shape?.kind === "marks" ? <InlineMarks ids={shape.ids} note={shape.note} /> : null}
          {shape?.kind === "count" ? (
            <span className="rounded-[2px] border border-border-gray bg-pure-white px-2.5 py-1 text-[12px] text-on-surface-variant">
              <span className="tnum font-semibold text-ink">{shape.value}</span> {shape.unit}
            </span>
          ) : null}
        </div>
        {sub ? (
          <p className="mt-1.5 text-[15px] leading-snug text-on-surface-variant">{sub}</p>
        ) : null}
        {/* Where this lives: one quiet line under the title, not a rail. */}
        {meta || link ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
            {meta ? <span className="whitespace-pre-wrap font-mono text-[11.5px]">{meta}</span> : null}
            {link ? (
              <a href={link.href} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-deep-green hover:underline">
                {link.label}
              </a>
            ) : null}
          </p>
        ) : null}
        {detail
          ? detail.split(/\n\s*\n/).map((para, i) => (
              <p key={i} className="mt-4 text-[14.5px] leading-relaxed text-on-surface">
                <Prose text={para} />
              </p>
            ))
          : null}
        {unsure ? (
          <p className="mt-4 border-l-2 border-amber-line bg-amber-surface/60 py-2 pl-3 pr-3 text-[13px] leading-snug text-amber-ink">
            <span className="font-semibold">Not certain: </span>
            <Prose text={unsure} />
          </p>
        ) : null}
      </div>
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
  table: "rows",
  sequence: "steps",
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
  // Code is not listed: it is behind every level now, not a destination.
  return (node.anatomy ?? [])
    .map((b) =>
      b.kind === "diagram" ? "diagram"
      : b.kind === "screen" ? `the ${b.title} screen`
      : b.kind === "example" ? "an example"
      : b.kind === "source" ? null
      // A reader's note is named as theirs here too: "what you will find if
      // you open it" is a different promise when part of it is their own.
      : b.kind === "note" ? "a note of yours"
      : `${b.rows.length} ${BLOCK_NOUN[b.kind]}`,
    )
    .filter(Boolean)
    .join(" · ");
}

/**
 * One part of the level: what it is, in a line, and what you will find if you
 * open it. Never its contents — those are the next step down.
 */
function Row({ node, at, onOpen }: { node: Node; at: string[]; onOpen: (p: string[]) => void }) {
  const go = openable(node) ? () => onOpen([...at, node.id]) : undefined;
  // No path on a card at all (D42): a card says what the part IS, and the
  // level it opens says where that lives.
  const peek = inside(node);
  const count = node.shape?.kind === "count" ? `${node.shape.value} ${node.shape.unit}` : null;

  return (
    <button
      data-node-id={node.id}
      data-path={JSON.stringify([...at, node.id])}
      onClick={go}
      disabled={!go}
      className={cn(
        "group flex w-full items-start gap-3 rounded-[3px] border bg-pure-white px-4 py-3 text-left transition-[border-color,box-shadow] duration-150",
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
          {node.issues?.length ? (
            <span className="shrink-0 rounded-[2px] border border-clay-line bg-clay-surface px-2 py-[3px] font-mono text-[10px] leading-none text-clay-ink">
              ⚠ {node.issues.length} {node.issues.length === 1 ? "problem" : "problems"}
            </span>
          ) : null}
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
