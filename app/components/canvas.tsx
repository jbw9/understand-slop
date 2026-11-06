"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { AnatomyView, TableGlyph, type RowCtx } from "@/components/anatomy";
import { DocsList, Example, ExplainedBlock, WatchOut, isExplained, sectionOrder, sectionTone } from "@/components/blocks";
import { Building, DraftNote, Stages, Unmapped, isBuilding, useDrawIn } from "@/components/building";
import { CodePopup, ExplainToggle, Explainer, StartHere, parseAt, useExplain, type CodeFocus } from "@/components/explain";
import { InlineMarks } from "@/components/shapes";
import { Eyebrow, Glossary, OriginMark, Prose, StateChip, SymbolLinks } from "@/components/state";
import { Zoom } from "@/components/zoom";
import { Crumbs, goTo, useLocation, useMayBeStale } from "@/components/chrome";
import { Button, CodeIcon } from "@/components/button";
import { Menu } from "@/components/menu";
import { useMap } from "@/components/map-context";
import { useFlash } from "@/components/flash";
import { useRedoing } from "@/components/statusbar";
import { DocView, closeDoc, useOpenDoc } from "@/components/docs";
import { TimelineView, closeTimeline, useTimelineOpen } from "@/components/timeline";
import { FileView, closeFile, openFile, useOpenFile } from "@/components/code";
import { AgentIcon, CLAUDE, useAgents } from "@/components/agents";
import { handTo, mention, openClaude, section, sectionKey, usePicked, type Target } from "@/lib/context";
import { startNote } from "@/lib/notes";
import { FixAndKeep, onAnswer } from "@/components/keep";
import { DragChip, SectionTabs, dropAt, dropInTab, openInTab, setPartDrag, tabTitle, type Drop } from "@/components/tabs";
import { BlockDiffView, RemovedSections, SectionTint, useBlockDiffs } from "@/components/diff";
import { DiffBar, HereChanges } from "@/components/diagram-diff";
import type { Exchange } from "@/lib/keep";
import { codeAt, describeElement, describeProblems, problemSpans, type BuiltMap } from "@/lib/map";
import { STATIC_MAP, readSource } from "@/lib/source";
import { useSettings, type Ground } from "@/lib/settings";
import type { Anatomy, Edge, Node } from "@/lib/data";
import { citations, neighbours, nodesAt, symbolsOf, type Link } from "@/lib/coverage";
import { useFiles } from "@/components/files";
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
  const { RUN, nodeAt, name, maps } = map;
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
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
  // So does the history (components/timeline.tsx).
  const timeline = useTimelineOpen();
  // And a whole file open to edit (components/code.tsx).
  const file = useOpenFile();
  const key = doc ? `doc:${doc.file}` : file ? `file:${file.file}` : timeline ? "timeline" : path.join("/");
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

  // A level gone into starts at its top; one come back to, where it was left.
  const scrolls = useRef(new Map<string, number>());
  const [came, setCame] = useState({ key, back: false });
  if (came.key !== key) setCame({ key, back: isBack(came.key, key) });

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
      traced,
      onTrace: (rid) => setTraced(traced === rid ? null : rid),
      open: path[path.length - 1] ?? null,
      onOpenRow,
    }),
    [traced, setTraced, path, onOpenRow],
  );

  /* ── keyboard ─────────────────────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && e.target.closest("textarea, input")) return;
      if (e.key === "Escape") {
        // Unwind one layer at a time: an open doc, file or the history, the trace, then one level.
        if (doc) closeDoc();
        else if (file) closeFile();
        else if (timeline) closeTimeline();
        else if (traced) setTraced(null);
        else if (path.length) goTo(path.slice(0, -1));
      } else if (e.key === "0" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        // ⌘0 belongs to the zoom reset, which listens on window too.
        goTo([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [traced, setTraced, path, doc, file, timeline]);

  /* ── handing a section to Claude ──────────────────────────── */

  // Right-click offers Claude the nearest thing under the pointer: a card or
  // the open level's header (`data-path`, a whole section), else a row, box,
  // block or line of code (`data-row`, `data-pick`). In the desktop app, and on
  // a published map, whose Claude is its panel; a plain browser keeps its own menu.
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const { ground } = useSettings();
  const [menu, setMenu] = useState<{ x: number; y: number; target: Target; words: string; opens: string[] | null } | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);
  const onContextMenu = (e: React.MouseEvent) => {
    // Anything else on the level — a caption, the space between blocks — is
    // part of the section you are in, so that is what it offers.
    const el = (e.target as Element).closest<HTMLElement | SVGElement>(PICKABLE);
    const target = el ? targetOf(map, el, path) : section(map, path);
    if (!target) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, target, words: wordsOf(map, el, path), opens: opensAt(e.target as Element, path) });
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

  // A part dragged off the map onto its strip of tabs opens there, as a link
  // dragged onto Chrome's tabs does (components/tabs.tsx). A press that hardly
  // moves is still a click, which opens the part in place.
  const grab = (e: React.PointerEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const target = e.target as Element;
    if (target.closest(":disabled")) return;
    const part = opener(target, path);
    if (!part) return;
    const { el, at } = part;
    const label = tabTitle(nodeAt, at);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moving = false;
    const move = (m: PointerEvent) => {
      if (!moving && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
      if (!moving) {
        moving = true;
        document.body.dataset.dragging = "";
        el.setAttribute("data-drag-source", "");
        window.getSelection()?.removeAllRanges();
      }
      setPartDrag({ label, x: m.clientX, y: m.clientY, drop: dropAt(m.clientX, m.clientY) });
    };
    const end = (drop: Drop | null) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      window.removeEventListener("keydown", key, true);
      if (!moving) return;
      delete document.body.dataset.dragging;
      el.removeAttribute("data-drag-source");
      setPartDrag(null);
      // The click this press ends in would open the part in place too.
      const swallow = (c: MouseEvent) => {
        c.preventDefault();
        c.stopPropagation();
      };
      window.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener("click", swallow, true));
      if (drop) dropInTab(name, at, drop);
    };
    const up = (u: PointerEvent) => end(dropAt(u.clientX, u.clientY));
    const cancel = () => end(null);
    // Esc lets go of the part, before it can take the map up a level.
    const key = (k: KeyboardEvent) => {
      if (k.key !== "Escape" || !moving) return;
      k.preventDefault();
      k.stopImmediatePropagation();
      end(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    window.addEventListener("keydown", key, true);
  };

  return (
    <div
      className="flex h-full w-full flex-col overflow-hidden bg-paper"
      onContextMenu={desktop || STATIC_MAP ? onContextMenu : undefined}
      onClickCapture={(e) => (e.metaKey || e.ctrlKey ? toTab(e) : undefined)}
      onAuxClickCapture={(e) => (e.button === 1 ? toTab(e) : undefined)}
      onPointerDown={grab}
      // The browser's own drag of a link would take the pointer from ours.
      onDragStart={(e) => (opensAt(e.target as Element, path) ? e.preventDefault() : undefined)}
    >
      {menu ? <PickMenu {...menu} onClose={closeMenu} /> : null}
      <DragChip />
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
        {doc || file || timeline ? null : <DiffBar path={path} />}
        <Zoom scrollRef={scrollRef}>
        <div ref={contentRef} className="relative mx-auto max-w-[1680px] px-10 pb-28 pt-5">
          {/* The CSS reduced-motion rule (app/globals.css) does not reach motion's own animations. */}
          <MotionConfig reducedMotion="user">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={key}
              custom={dir}
              variants={{
                in: { opacity: 1, y: 0 },
                out: (d: number) => ({ opacity: 0, y: 10 * d }),
                // Leaving is quicker than arriving, and takes no clicks: a
                // second click on the level going away would open one of its parts.
                gone: (d: number) => ({ opacity: 0, y: -6 * d, pointerEvents: "none", transition: { duration: 0.1, ease: [0.22, 1, 0.36, 1] } }),
              }}
              initial="out"
              animate="in"
              exit="gone"
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            >
              <Arrive pane={scrollRef} kept={scrolls} at={key} back={came.back} />
              {doc ? (
                <DocView file={doc.file} line={doc.line} />
              ) : file ? (
                <FileView key={file.file} file={file.file} line={file.line} />
              ) : timeline ? (
                <TimelineView />
              ) : (
                <>
                  <HereChanges path={path} />
                  <Level node={focus ?? map.TOP} path={path} ctx={ctx} onOpen={goTo} />
                </>
              )}
            </motion.div>
          </AnimatePresence>
          </MotionConfig>
        </div>
        </Zoom>
      </main>
    </div>
  );
}

const overlaid = (key: string) => key === "timeline" || key.startsWith("doc:") || key.startsWith("file:");

/** Whether `to` is where `from` was reached from: up the path, or out from under a doc, file or the history. */
function isBack(from: string, to: string) {
  if (overlaid(to)) return false;
  return overlaid(from) || (from !== to && (to === "" || from.startsWith(`${to}/`)));
}

/**
 * Scrolls the pane for a level as it arrives, and keeps where it was left as
 * it goes. Mounted inside the level rather than run on the change of path: the
 * level leaving is still on screen while it fades, and scrolling then jerked it
 * to its top under the reader's eyes.
 */
function Arrive({ pane, kept, at, back }: { pane: React.RefObject<HTMLElement | null>; kept: React.RefObject<Map<string, number>>; at: string; back: boolean }) {
  useLayoutEffect(() => {
    const el = pane.current;
    const tops = kept.current;
    if (!el) return;
    el.scrollTo({ top: back ? (tops.get(at) ?? 0) : 0 });
    return () => void tops.set(at, el.scrollTop);
  }, [pane, kept, at, back]);
  return null;
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
 * The level a clicked element leads to, if it leads anywhere but here, and the
 * element that leads there: a part's card (`data-path`), a step of the way
 * back (`data-opens-at`), or a diagram box, whose href is that part's own URL.
 */
function opener(el: Element, here: string[]): { el: Element; at: string[] } | null {
  const link = el.closest("a[href]");
  const href = link?.getAttribute("href");
  if (link && href?.startsWith("?")) {
    const at = new URLSearchParams(href).getAll("at");
    return at.join("/") !== here.join("/") ? { el: link, at } : null;
  }
  const card = el.closest<HTMLElement | SVGElement>("[data-opens-at], [data-path]");
  const raw = card?.dataset.opensAt ?? card?.dataset.path;
  if (!card || !raw) return null;
  const at = JSON.parse(raw) as string[];
  return at.join("/") !== here.join("/") ? { el: card, at } : null;
}

const opensAt = (el: Element, here: string[]) => opener(el, here)?.at ?? null;

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

/**
 * The words a suggested edit starts from: what the thing says on screen. A
 * section is its one line; an element, its own text.
 */
function wordsOf(map: BuiltMap, el: HTMLElement | SVGElement | null, level: string[]): string {
  const at: string[] | null = el?.dataset.path !== undefined ? JSON.parse(el.dataset.path) : el ? null : level;
  if (at) return map.nodeAt(at)?.sub ?? "";
  const shown = el && "innerText" in el ? el.innerText : (el?.textContent ?? "");
  return shown.trim().slice(0, 600);
}

function PickMenu({
  x,
  y,
  target,
  words,
  opens,
  onClose,
}: {
  x: number;
  y: number;
  target: Target;
  /** What it says on screen, for a suggested edit to start from. */
  words: string;
  /** The level the thing under the pointer opens, offered in a new tab. */
  opens: string[] | null;
  onClose: () => void;
}) {
  const { name } = useMap();
  return (
    <Menu
      x={x}
      y={y}
      title={target.title}
      onClose={onClose}
      items={[
        ...(opens ? [{ label: "Open in new tab", onClick: () => openInTab(name, opens) }] : []),
        { label: "Add to Claude", onClick: () => mention(target) },
        {
          label: "Add and open Claude",
          onClick: () => {
            mention(target);
            openClaude();
          },
        },
        // A review, sent later as one turn (components/review-tray.tsx).
        { label: "Comment…", separated: true, onClick: () => startNote({ x, y, kind: "comment", anchor: target }) },
        ...(words ? [{ label: "Suggest an edit…", onClick: () => startNote({ x, y, kind: "suggest" as const, anchor: target, before: words }) }] : []),
      ]}
    />
  );
}

/**
 * Asks the default agent (Settings) about a section's problems, all of them,
 * straight away: Claude takes them as context with the question, and the
 * button follows them there; another agent gets them in its prompt with the
 * question, sent. In the desktop app, where the agents run, and on a published
 * map, to its Claude panel.
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
  if (!desktop && !STATIC_MAP) return null;
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
  const index = useFiles()?.index ?? null;
  const key = path.join("/");
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is `path` by value
  const reach = useMemo(() => neighbours(map.L0, index, path), [map.L0, index, key]);
  const walks = map.OVERVIEW?.walkthroughs ?? (explainOn && map.OVERVIEW?.walkthrough ? [map.OVERVIEW.walkthrough] : []);
  // Each indexed symbol a level cites, by name, to the deepest level citing it;
  // a name two places define links nowhere rather than to the wrong one.
  const symbols = useMemo(() => {
    const cited = citations(map.L0);
    const at = new Map<string, string[] | null>();
    for (const [file, f] of Object.entries(index?.files ?? {}))
      for (const s of symbolsOf(cited, file, f)) {
        const p = s.by[0]?.path;
        if (!p) continue;
        const prev = at.get(s.name);
        at.set(s.name, prev === undefined || prev?.join("/") === p.join("/") ? p : null);
      }
    return at;
  }, [map.L0, index]);
  const linkOf = (name: string) => {
    const p = symbols.get(name.replace(/\(.*\)$/, "")) ?? symbols.get(name.replace(/\(.*\)$/, "").split(".").pop()!);
    return p && p.join("/") !== key ? () => onOpen(p) : undefined;
  };
  // A scenery box's code, opened at the section that explains it: the deepest
  // citing that line, else the root that owns the file, else the file itself.
  const openRef = (ref: string) => {
    const m = /^(.+?)(?::(\d+))?(?:-\d+)?$/.exec(ref);
    if (!m) return;
    const cited = citations(map.L0);
    const hit = m[2] ? nodesAt(cited, m[1], +m[2])[0] : (cited.get(m[1]) ?? []).slice().sort((a, b) => a.path.length - b.path.length)[0];
    const root = index?.files[m[1]]?.roots.find((r) => map.L0.some((n) => n.id === r));
    if (hit) onOpen(hit.path);
    else if (root) onOpen([root]);
    else openFile(path, m[1], m[2] ? +m[2] : undefined);
  };
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
  // A quick section still to be written in full (pipeline.ts, --fast): the
  // reader opening it asks for it next, and its header says what is coming.
  const section = top ? undefined : path[0];
  const queued = section && map.progress?.stage === "deepen" ? map.progress.roots.find((r) => r.id === section) : undefined;
  const deepening = queued?.status === "queued" || queued?.status === "drafting" ? queued.status : undefined;
  useEffect(() => {
    if (deepening === "queued" && section) void fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "focus", id: map.name, section }) }).catch(() => {});
  }, [deepening, section, map.name]);
  // A project opened without a map, and no run making one (lib/maps.ts, unmapped).
  const unmapped = top && !STATIC_MAP && !map.progress && !node.children?.length && !blocks.length;

  return (
    <Glossary.Provider value={explainOn ? (map.OVERVIEW?.glossary ?? []) : []}>
    <SymbolLinks.Provider value={linkOf}>
      <Header
        path={path}
        deepening={deepening}
        back={
          top
            ? undefined
            : path.slice(0, -1).reduce(
                (crumbs, _, i) => [
                  ...crumbs,
                  { label: nodeAt(path.slice(0, i + 1))?.title ?? "", path: path.slice(0, i + 1), onClick: () => onOpen(path.slice(0, i + 1)) },
                ],
                [{ label: RUN.repo, path: [] as string[], onClick: () => onOpen([]) }],
              )
        }
        eyebrow={top ? undefined : `Inside ${parent?.title ?? RUN.repo}`}
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
        shape={node.shape}
        onCode={code.length ? () => setCodeFocus({ heading: `The code behind ${node.title}`, refs: code, verified: node.verified }) : undefined}
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
        {unmapped ? <Unmapped id={map.name} /> : null}
        {top && !run && map.progress && map.progress.stage !== "done" ? <Stages progress={map.progress} /> : null}
        {/* For a reader new to all of this: the level in plain words, before
            any of the terse parts. */}
        {explainOn && node.explain ? <Explainer owner={node.id} explain={node.explain} ctx={levelCtx} /> : null}

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
                  onRef={openRef}
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

        {!run ? <Reach uses={reach.uses} usedBy={reach.usedBy} onOpen={onOpen} /> : null}

        {/* The repository's way in comes after its picture: the walkthroughs
            open parts the reader has just seen drawn. A map from before they
            were core keeps its one under the Explain layer. */}
        {top && !run && walks.length ? <StartHere walkthroughs={walks} onOpen={onOpen} /> : null}

        {node.issues?.length ? (
          <div>
            <div className="max-w-[820px]">
              <WatchOut issues={node.issues} action={<HandProblems node={node} path={path} />} onCode={showStep} />
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
    </SymbolLinks.Provider>
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
            <li key={i} data-pick={blockLabel(b)} className="overflow-hidden border border-border-gray bg-card">
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
                "group flex w-full items-center gap-2.5 border-b border-border-gray/70 px-1.5 py-2.5 text-left transition-colors",
                go && "hover:bg-surface-container-low",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
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
                  className="shrink-0 text-[14px] text-faint transition-colors group-hover:text-accent"
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

/**
 * What a level's code imports, and what imports it, each as the section that
 * explains the other side (lib/coverage.ts neighbours): where to read next,
 * and what a change here reaches.
 */
function Reach({ uses, usedBy, onOpen }: { uses: Link[]; usedBy: Link[]; onOpen: (p: string[]) => void }) {
  const { nodeAt } = useMap();
  if (!uses.length && !usedBy.length) return null;
  const SHOWN = 8;
  const row = (label: string, gloss: string, links: Link[]) =>
    links.length ? (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1.5">
        <span className="mr-1.5 flex w-[96px] shrink-0 flex-col gap-1">
          <Eyebrow>{label}</Eyebrow>
          <span className="text-[11px] leading-tight text-faint">{gloss}</span>
        </span>
        {links.slice(0, SHOWN).map((l) => {
          const titles = l.path ? l.path.map((_, i) => nodeAt(l.path!.slice(0, i + 1))?.title).filter(Boolean) : [];
          const name = titles.slice(-2).join(" › ");
          const title = `${l.via}${l.count > 1 ? ` and ${l.count - 1} more` : ""}`;
          return l.path && name ? (
            <button
              key={l.path.join("/")}
              onClick={() => onOpen(l.path!)}
              title={title}
              className=" border border-border-gray px-2 py-1 text-[12.5px] text-ink transition-colors hover:border-accent hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {name}
            </button>
          ) : (
            <span key={l.file} title={title} className="px-1 font-mono text-[11.5px] text-faint">
              {l.file.split("/").pop()}
            </span>
          );
        })}
        {links.length > SHOWN ? <span className="text-[12px] text-faint">+{links.length - SHOWN} more</span> : null}
      </div>
    ) : null;
  return (
    <section data-pick="Uses and used by" className="flex max-w-[820px] flex-col gap-3">
      {row("Uses", "what its code imports", uses)}
      {row("Used by", "what a change here reaches", usedBy)}
    </section>
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
  deepening,
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
  /** A quick section's place in being written in full: still waiting, or being written now. */
  deepening?: "queued" | "drafting";
  /** The level above, named — so "back" says where it goes. */
  back?: { label: string; path: string[]; onClick: () => void }[];
  eyebrow?: string;
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
  const stale = useMayBeStale(origin);
  // This level, or the section it sits in, is being redone by an update.
  const redoing = useRedoing();
  const rewriting = path.some((id) => redoing.includes(id));
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
              data-opens-at={JSON.stringify(crumb.path)}
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
      {deepening && !rewriting ? (
        <div role="status" className={cn("mb-5 flex max-w-[720px] items-center gap-2 border border-accent-line bg-accent-surface/60 px-3 py-2 text-[13px] text-accent", deepening === "drafting" && "shimmer")}>
          <span aria-hidden className={cn("size-[7px] shrink-0 rounded-full bg-accent", deepening === "drafting" && "animate-pulse")} />
          {deepening === "drafting"
            ? "This is a quick first version. The full one is being written now; it usually takes a minute or two and appears here by itself."
            : "This is a quick first version. The full one is written next, since you opened it, and appears here by itself."}
        </div>
      ) : null}
      {rewriting ? (
        <div role="status" className="shimmer mb-5 flex max-w-[720px] items-center gap-2 border border-amber-line bg-amber-surface/60 px-3 py-2 text-[13px] text-amber-ink">
          <span aria-hidden className="size-[7px] shrink-0 animate-pulse rounded-full bg-amber-ink" />
          Rewriting this section from your conversation. It usually takes a minute or two and updates here by itself.
        </div>
      ) : null}
      <div className="max-w-[720px]">
        {eyebrow ? <Eyebrow>{eyebrow}</Eyebrow> : null}
        <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-2", eyebrow && "mt-2")}>
          <h1 className="font-display text-[clamp(32px,3.2vw,46px)] font-normal leading-[1.02] tracking-[-0.018em] text-ink">
            {title}
          </h1>
          {state ? <StateChip state={state} alarm={alarm} /> : null}
          {/* Beside the state mark, never instead of it: the two answer
              different questions (see `Origin` in lib/data.ts). */}
          {origin ? <OriginMark origin={origin} stale={stale} /> : null}
          {shape?.kind === "marks" ? <InlineMarks ids={shape.ids} note={shape.note} /> : null}
          {shape?.kind === "count" ? (
            <span className=" border border-border-gray bg-card px-2.5 py-1 text-[12px] text-on-surface-variant">
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
              <a href={link.href} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-accent hover:underline">
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
        "group flex w-full items-start gap-3 border bg-card px-4 py-3 text-left transition-[border-color,box-shadow] duration-150",
        node.ghost ? "border-dashed border-border-strong bg-surface-container-low/60" : "border-border-gray",
        go && "hover:border-border-strong hover:shadow-panel",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">
            {node.title}
          </span>
          <StateChip state={node.state} alarm={node.alarm} />
          {node.issues?.length ? (
            <span className="shrink-0 border border-clay-line bg-clay-surface px-2 py-[3px] font-mono text-[10px] leading-none text-clay-ink">
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
          className="pt-0.5 text-[15px] text-faint transition-colors group-hover:text-accent"
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
          ? "border-accent-line bg-accent-surface text-accent"
          : "border-amber-line bg-amber-surface text-amber-ink",
      )}
    >
      {n}
    </span>
  );
}
