"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { KindLabel } from "@/components/card";
import { StateChip } from "@/components/state";
import type { Edge, Node } from "@/lib/data";
import { useMap, type MapData } from "@/components/map-context";
import { hrefFor, onPlainClick } from "@/components/nav";

/**
 * One level of the map as a list: cards in order, an edge between two
 * adjacent cards drawn as the gap between them, every other edge as a chip on
 * the card it leaves. Shared by the explorer's focus view and the columns.
 */

export const EASE = [0.22, 1, 0.36, 1] as const;
export const LAYER_NAME = { surface: "surface", flow: "data flow", code: "code" } as const;

/** A row id names its owner before the colon: `gate-quota:Anonymous`. */
export const ownerOf = (rowKey: string) => rowKey.slice(0, rowKey.indexOf(":"));

/**
 * The members of the level under `parentPath`. Row children appear only when
 * the path names them — they answer separate questions, and you asked one.
 * Code units are never listed: they are read and edited together in their
 * owner's pane, so picking a flow shows every function behind it at once.
 */
export function membersAt(map: MapData, parentPath: string[], selected: string | undefined) {
  return map.levelAt(parentPath).filter(
    (n) => !n.unit && (!n.fromRow || n.id === selected),
  );
}

/** Does this node open a level of its own (children that aren't code)? */
export const opensLevel = (n: Node) => (n.children ?? []).some((c) => !c.unit);

export function LevelList({
  members,
  edges,
  selected,
  pointed,
  ruleStores,
  hrefOf,
  onPick,
  onJump,
  onPoint,
}: {
  members: Node[];
  edges: Edge[];
  selected: string | undefined;
  pointed: string | null;
  /** Draw "behind the surface" before the first store (the root level). */
  ruleStores?: boolean;
  /** The link each card is, so it can open in a new tab. */
  hrefOf?: (id: string) => string;
  onPick: (id: string) => void;
  onJump: (id: string) => void;
  onPoint: (id: string | null) => void;
}) {
  // An edge between two cards that sit one above the other is drawn as the
  // gap between them; any other edge is a chip on the card it leaves. Most
  // levels here are sequences, so most edges become the plain "and then".
  const adjacent = (a: Node, b: Node) =>
    edges.find((e) => e.from === a.id && e.to === b.id);
  const inline = new Set<Edge>();
  members.forEach((n, k) => {
    const e = k > 0 ? adjacent(members[k - 1], n) : undefined;
    if (e) inline.add(e);
  });

  return (
    <>
      {members.map((n, k) => {
        const into = k > 0 ? adjacent(members[k - 1], n) : undefined;
        // The one break inside a level: on the surface, what you walk
        // through comes first and what it writes to sits behind a rule.
        const rule = ruleStores && n.kind === "store" && members[k - 1]?.kind !== "store";
        const out = edges.filter((e) => e.from === n.id && !inline.has(e));
        return (
          <motion.div
            key={n.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.28, ease: EASE, delay: k * 0.035 }}
          >
            {rule ? (
              <p className="mb-2 mt-4 border-t border-dashed border-border-gray pt-2 font-mono text-[9.5px] text-faint">
                behind the surface
              </p>
            ) : into ? (
              <Connector edge={into} />
            ) : k > 0 ? (
              <div className="h-2" />
            ) : null}
            <ListCard
              node={n}
              selected={n.id === selected}
              pointed={n.id === pointed}
              href={hrefOf?.(n.id)}
              onClick={() => onPick(n.id)}
            >
              {/* Inside the card, not under it: under it, the chips sat
                  between a card and the connector leaving it, and broke the
                  "and then" the connector is there to say. */}
              {out.map((e) => (
                <RelationChip
                  key={`${e.from}>${e.to}`}
                  edge={e}
                  onPoint={onPoint}
                  onJump={onJump}
                />
              ))}
            </ListCard>
          </motion.div>
        );
      })}
    </>
  );
}

/** "And then": the gap between two cards, when an edge runs straight down it. */
export function Connector({ edge }: { edge: Edge }) {
  return (
    <div className="flex items-center gap-2 py-1 pl-6" aria-label={edge.label ?? "then"}>
      <span className="flex flex-col items-center">
        <span
          className={cn(
            "h-4 border-l",
            // Dashing encodes state, as it does on every wire on the canvas.
            edge.state === "inferred" ? "border-dashed" : "border-solid",
            edge.alarm ? "border-clay-line" : "border-wire",
          )}
        />
        <span
          className={cn(
            "-mt-px h-0 w-0 border-x-[3.5px] border-t-[5px] border-x-transparent",
            edge.alarm ? "border-t-clay-line" : "border-t-wire",
          )}
        />
      </span>
      {edge.label ? (
        <span className="font-mono text-[9.5px] text-faint">{edge.label}</span>
      ) : null}
    </div>
  );
}

/** Any other edge: a chip on the card it leaves, naming where it goes. */
export function RelationChip({
  edge,
  onPoint,
  onJump,
}: {
  edge: Edge;
  onPoint: (id: string | null) => void;
  onJump: (id: string) => void;
}) {
  const { titleOf, pathTo, name } = useMap();
  return (
    <a
      href={hrefFor(name, pathTo(edge.to) ?? [])}
      data-row
      onMouseEnter={() => onPoint(edge.to)}
      onMouseLeave={() => onPoint(null)}
      onFocus={() => onPoint(edge.to)}
      onBlur={() => onPoint(null)}
      onClick={(e) =>
        onPlainClick(e, () => {
          onPoint(null);
          onJump(edge.to);
        })
      }
      className={cn(
        "max-w-full cursor-pointer truncate rounded-full border bg-pure-white px-2 py-[3px] font-mono text-[9.5px] text-on-surface-variant",
        "transition-[border-color,color] duration-150 hover:border-border-strong hover:text-ink",
        edge.state === "inferred" ? "border-dashed border-border-strong" : "border-border-gray",
      )}
    >
      → {edge.label ? `${edge.label} · ` : ""}
      {titleOf(edge.to)}
    </a>
  );
}

export function ListCard({
  node,
  selected,
  pointed,
  href,
  onClick,
  children,
}: {
  node: Node;
  selected: boolean;
  pointed: boolean;
  /** Where this card lives, as a link: a plain click is `onClick`, and the
   *  browser keeps middle-click and ctrl/⌘-click for opening a new tab. */
  href?: string;
  onClick: () => void;
  /** Relation chips, drawn as the card's footer. */
  children?: React.ReactNode[];
}) {
  // A column opens only for children that are not code; code is counted
  // instead, because it shows in the pane the moment you pick this card.
  const more = (node.children ?? []).some((c) => !c.unit);
  const code = (node.children ?? []).filter((c) => c.unit).length;
  return (
    // A div holding two kinds of link — the card face, and its chips —
    // because a link cannot contain another.
    <div
      className={cn(
        "rounded-[14px] border bg-pure-white",
        "transition-[border-color,box-shadow,background-color] duration-150",
        node.ghost
          ? "border-dashed border-border-strong bg-surface-container-low/60"
          : "border-border-gray",
        selected
          ? "border-deep-green ring-1 ring-deep-green"
          : pointed
            ? "border-border-strong bg-surface"
            : "hover:border-border-strong hover:shadow-panel",
      )}
    >
      <a
        href={href ?? "#"}
        onClick={(e) => onPlainClick(e, onClick)}
        aria-current={selected ? "true" : undefined}
        data-title={node.title}
        className="flex w-full cursor-pointer select-none items-start gap-2 rounded-[14px] px-3.5 py-2.5 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-deep-green"
      >
        <span className="min-w-0 flex-1">
          <KindLabel kind={node.kind} />
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.01em] text-ink",
                node.unit && "font-mono",
              )}
            >
              {node.title}
            </span>
            <StateChip state={node.state} alarm={node.alarm} />
          </span>
          <span className="mt-0.5 block truncate font-mono text-[10.5px] text-faint">
            {node.unit ? node.unit.signature : node.sub}
          </span>
        </span>
        {code && !more ? (
          <span className="mt-[13px] shrink-0 font-mono text-[9.5px] text-faint">
            {code} fn
          </span>
        ) : (
          <span
            aria-hidden
            className={cn(
              "mt-[15px] shrink-0 text-[13px] leading-none",
              more ? (selected ? "text-deep-green" : "text-faint") : "text-transparent",
            )}
          >
            ›
          </span>
        )}
      </a>
      {children?.length ? (
        <div className="flex flex-wrap gap-1 border-t border-border-gray px-3 py-2">
          {children}
        </div>
      ) : null}
    </div>
  );
}
