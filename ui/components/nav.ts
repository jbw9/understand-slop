"use client";

import { useCallback, useMemo, useState } from "react";
import type { RowCtx } from "@/components/anatomy";
import { ownerOf } from "@/components/level";
import { LINKS, pathTo } from "@/lib/current";

const noAnchor = () => () => {};

/**
 * Where you are in the map, and the row state that goes with it. Shared by
 * every view so they agree on what a path means: root first, the open node
 * last, a row child as `owner:key` after its owner.
 */
export function useMapNav() {
  const [path, setPath] = useState<string[]>([]);
  /** The row whose links are listed in the detail pane. */
  const [traced, setTraced] = useState<string | null>(null);

  /** Go to an exact path, dropping any trace. */
  const go = useCallback((next: string[]) => {
    setTraced(null);
    setPath(next);
  }, []);

  /** Jump to any node by id — what a relation chip or a row link does. */
  const jump = useCallback((id: string, trace?: string) => {
    const to = pathTo(id);
    if (!to) return;
    setPath(to);
    setTraced(trace ?? null);
  }, []);

  const lit = useMemo(() => {
    if (!traced) return new Set<string>();
    const s = new Set<string>([traced]);
    for (const l of LINKS) {
      if (l.from === traced) s.add(l.to);
      if (l.to === traced) s.add(l.from);
    }
    return s;
  }, [traced]);

  const rowCtx = useMemo<RowCtx>(
    () => ({
      anchor: noAnchor,
      lit,
      tracing: Boolean(traced),
      onTrace: (rid) => setTraced((cur) => (cur === rid ? null : rid)),
      open: path[path.length - 1] ?? null,
      // Truncate at the row's owner, then append — never just append. The
      // owner is usually the open node, but switching between sibling rows
      // happens with the previous row's child already on the path.
      onOpenRow: (rid) => {
        setTraced(null);
        setPath((cur) => {
          const at = cur.indexOf(ownerOf(rid));
          return at < 0 ? cur : [...cur.slice(0, at + 1), rid];
        });
      },
    }),
    [lit, traced, path],
  );

  return { path, setPath, go, traced, setTraced, jump, rowCtx };
}
