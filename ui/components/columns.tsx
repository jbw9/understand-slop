"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Detail } from "@/components/detail";
import { EditsProvider } from "@/components/edits";
import { EASE, LAYER_NAME, LevelList, membersAt } from "@/components/level";
import { useMapNav } from "@/components/nav";
import { layerOf, type Edge, type Node } from "@/lib/data";
import { RUN, edgesOf, nodeAt } from "@/lib/current";

/**
 * The map as columns, Finder-style: the surface on the left, the data flow
 * behind whatever you picked to its right, the code behind that, and the full
 * card for the deepest pick at the end.
 *
 * It replaces the zoom canvas as the main view (D14) because the canvas lost
 * your place: every level opened beneath its parent and the camera flew to
 * it, so the ancestors left the screen, the wires routed around cards that
 * were still growing, and every step down was a pan and a zoom. Here the
 * whole path stays on screen, a step down is one column to the right, and
 * relations are drawn inline beside the cards they belong to.
 */

export function Columns() {
  const { path, setPath, traced, setTraced, jump, rowCtx } = useMapNav();
  /** A card a relation chip is pointing at, while the chip is hovered. */
  const [pointed, setPointed] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  /** Pick `id` in column `i`: everything to its right is replaced. */
  const select = useCallback(
    (i: number, id: string) => {
      setTraced(null);
      setPath((cur) => [...cur.slice(0, i), id]);
    },
    [setPath, setTraced],
  );

  const columns = useMemo(() => {
    const out: { parentPath: string[]; members: Node[]; edges: Edge[] }[] = [];
    for (let i = 0; i <= path.length; i++) {
      const parentPath = path.slice(0, i);
      const members = membersAt(parentPath, path[i]);
      if (i > 0 && members.length === 0) break;
      out.push({ parentPath, members, edges: edgesOf(parentPath) });
    }
    return out;
  }, [path]);

  const deepest = path.length ? nodeAt(path) : null;
  // A path can still end AT a unit (a jump, or an old link). Its owner's pane
  // is shown instead, scrolled to that unit.
  const focusUnit = deepest?.unit ? deepest.id : null;
  const open = focusUnit ? nodeAt(path.slice(0, -1)) : deepest;

  // A new column, or a new card in the detail pane, comes into view from the
  // right. Scrolling to the end rather than to the column keeps the detail
  // pane — the thing you just asked for — on screen.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
  }, [path]);

  /* ── keyboard: Finder's arrows ─────────────────────────────── */

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input,textarea,[contenteditable]")) return;
      const depth = path.length;
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const i = Math.max(0, depth - 1);
        const list = membersAt(path.slice(0, i), path[i]);
        if (!list.length) return;
        const at = list.findIndex((n) => n.id === path[i]);
        const step = e.key === "ArrowDown" ? 1 : -1;
        const next = at < 0 ? 0 : Math.min(list.length - 1, Math.max(0, at + step));
        select(i, list[next].id);
      } else if (e.key === "ArrowRight" || e.key === "Enter") {
        const list = membersAt(path, undefined);
        if (!list.length) return;
        e.preventDefault();
        select(depth, list[0].id);
      } else if (e.key === "ArrowLeft" || e.key === "Escape") {
        if (e.key === "Escape" && traced) {
          setTraced(null);
          return;
        }
        if (!depth) return;
        e.preventDefault();
        setTraced(null);
        setPath((cur) => cur.slice(0, -1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [path, traced, select, setPath, setTraced]);

  return (
    <EditsProvider>
      <div className="flex h-dvh flex-col bg-warm-cream">
        <header className="flex shrink-0 items-baseline gap-3 border-b border-border-gray px-5 py-3">
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-ink">
            {RUN.repo}
          </span>
          <span className="font-mono text-[10.5px] text-faint">
            {RUN.commit} · {RUN.files} files
          </span>
          <span className="ml-auto hidden font-mono text-[10px] text-faint md:inline">
            ↑ ↓ pick · → open · ← back
          </span>
        </header>

        <div ref={scroller} className="flex min-h-0 flex-1 overflow-x-auto">
          <AnimatePresence initial={false}>
            {columns.map((col, i) => (
              <Column
                key={col.parentPath.join("/") || "root"}
                index={i}
                parentPath={col.parentPath}
                members={col.members}
                edges={col.edges}
                selected={path[i]}
                pointed={pointed}
                onSelect={select}
                onJump={jump}
                onPoint={setPointed}
              />
            ))}
          </AnimatePresence>
          <Detail
            node={open}
            focusUnit={focusUnit}
            ctx={rowCtx}
            traced={traced}
            onJump={jump}
          />
        </div>
      </div>
    </EditsProvider>
  );
}

/* ── a column ───────────────────────────────────────────────── */

function Column({
  index,
  parentPath,
  members,
  edges,
  selected,
  pointed,
  onSelect,
  onJump,
  onPoint,
}: {
  index: number;
  parentPath: string[];
  members: Node[];
  edges: Edge[];
  selected: string | undefined;
  pointed: string | null;
  onSelect: (i: number, id: string) => void;
  onJump: (id: string) => void;
  onPoint: (id: string | null) => void;
}) {
  const parent = parentPath.length ? nodeAt(parentPath) : null;
  const layer = LAYER_NAME[layerOf(members[0]?.kind)];

  return (
    <motion.section
      aria-label={parent ? `${layer} in ${parent.title}` : layer}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8, transition: { duration: 0.12 } }}
      transition={{ duration: 0.28, ease: EASE }}
      className="flex h-full w-[300px] shrink-0 flex-col border-r border-border-gray"
    >
      <div className="shrink-0 px-4 pb-2 pt-4">
        <p className="font-mono text-[9px] uppercase leading-none tracking-[0.09em] text-faint">
          {layer}
        </p>
        <p className="mt-1.5 truncate text-[11.5px] text-on-surface-variant">
          {parent ? (
            <>
              in <span className="font-semibold text-ink">{parent.title}</span>
            </>
          ) : (
            RUN.repo
          )}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6">
        <LevelList
          members={members}
          edges={edges}
          selected={selected}
          pointed={pointed}
          ruleStores={index === 0}
          onPick={(id) => onSelect(index, id)}
          onJump={onJump}
          onPoint={onPoint}
        />
      </div>
    </motion.section>
  );
}
