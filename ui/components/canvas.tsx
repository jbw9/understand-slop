"use client";

import { useMemo, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { StateChip } from "@/components/state";
import { WireLayer, wireKind, useWireAnchors, type Wire } from "@/components/wires";
import { E0, E1, L0, L1, type Edge, type Node } from "@/lib/data";

/**
 * The diagram. Level 0 is the whole change as six subsystems; clicking one
 * expands it in place into its members (level 1); clicking a member opens the
 * detail pane (level 2).
 *
 * Expansion happens inside the canvas rather than by replacing it, so you never
 * lose the surrounding shape — the thing that makes a map worth having.
 */

export function Canvas({
  open,
  selected,
  onOpen,
  onSelect,
}: {
  /** The expanded subsystem, or null at the top level. */
  open: string | null;
  /** The node whose detail is showing. */
  selected: string | null;
  onOpen: (id: string | null) => void;
  onSelect: (id: string) => void;
}) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const { nodes, anchor, version } = useWireAnchors();

  const wires = useMemo<Wire[]>(() => {
    const edges: Edge[] = open ? [...E0, ...(E1[open] ?? [])] : E0;
    return edges.map((e) => ({
      from: e.from,
      to: e.to,
      kind: wireKind(e.state, e.alarm),
      // Edges touching the focused subsystem stay loudest; the rest recede.
      depth: !open || e.from === open || e.to === open ? 0 : 1,
    }));
  }, [open]);

  return (
    <div
      ref={canvasRef}
      className="dotfield relative min-h-[520px] flex-1 overflow-hidden rounded-[20px] border border-border-gray bg-surface/40 p-6 md:p-10"
    >
      <WireLayer
        canvasRef={canvasRef}
        nodes={nodes}
        wires={wires}
        version={version}
        reflowKey={`${open}:${selected}`}
      />

      <div className="relative z-20 grid grid-cols-1 gap-x-16 gap-y-4 md:grid-cols-3">
        {L0.map((node) => (
          <div
            key={node.id}
            className="flex flex-col gap-3"
            style={{ gridColumn: node.col + 1, gridRow: node.row + 1 }}
          >
            <NodeCard
              node={node}
              ref={anchor(node.id)}
              dimmed={Boolean(open) && open !== node.id}
              expanded={open === node.id}
              selected={selected === node.id}
              onClick={() => {
                onSelect(node.id);
                onOpen(open === node.id ? null : node.id);
              }}
            />

            <AnimatePresence initial={false}>
              {open === node.id && (L1[node.id]?.length ?? 0) > 0 ? (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-2 pl-5">
                    {L1[node.id].map((child) => (
                      <NodeCard
                        key={child.id}
                        node={child}
                        ref={anchor(child.id)}
                        compact
                        selected={selected === child.id}
                        onClick={() => onSelect(child.id)}
                      />
                    ))}
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </div>
  );
}

function NodeCard({
  node,
  ref,
  compact,
  dimmed,
  expanded,
  selected,
  onClick,
}: {
  node: Node;
  ref: (el: HTMLElement | null) => void;
  compact?: boolean;
  dimmed?: boolean;
  expanded?: boolean;
  selected?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className={cn(
        "group w-full rounded-[14px] border bg-pure-white px-4 text-left transition-all duration-200",
        compact ? "py-2.5" : "py-3.5",
        // A hole in the analysis is drawn as a hole: dashed edge, no fill
        // weight. It should look unfinished, because it is.
        node.ghost
          ? "border-dashed border-border-strong bg-surface-container-low/60"
          : "border-border-gray",
        selected && "border-deep-green ring-1 ring-deep-green",
        expanded && !selected && "border-border-strong",
        dimmed ? "opacity-45" : "opacity-100",
        "hover:border-border-strong hover:shadow-panel",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "min-w-0 flex-1 truncate font-semibold tracking-[-0.01em] text-ink",
            compact ? "text-[13px]" : "text-[14.5px]",
          )}
        >
          {node.title}
        </span>
        <StateChip state={node.state} alarm={node.alarm} />
      </div>
      <p
        className={cn(
          "mt-1 truncate font-mono text-faint",
          compact ? "text-[10.5px]" : "text-[11.5px]",
        )}
      >
        {node.sub}
      </p>
    </button>
  );
}
