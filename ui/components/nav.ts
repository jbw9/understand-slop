"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RowCtx } from "@/components/anatomy";
import { ownerOf } from "@/components/level";
import { useMap } from "@/components/map-context";

const noAnchor = () => () => {};

/* ── the path in the URL ─────────────────────────────────────────
   `?map=<name>&at=<id>/<id>/…`, each id URI-encoded so one containing "/"
   can't split. Every move pushes a history entry, so the browser's back and
   forward — the mouse's side buttons, Alt+←, a swipe — step through cards,
   and every card can be a real link: middle-click opens it in a new tab. */

/** The href for a path on a map. */
export function hrefFor(map: string, path: string[]) {
  const at = path.length ? `&at=${path.map(encodeURIComponent).join("/")}` : "";
  return `?map=${encodeURIComponent(map)}${at}`;
}

/** The path the current URL names, undecoded until split. */
function pathInUrl(): string[] {
  const m = /[?&]at=([^&]*)/.exec(window.location.search);
  return m && m[1] ? m[1].split("/").map(decodeURIComponent) : [];
}

/**
 * A link's click, unless the browser should handle it: a middle click, or
 * any modifier (new tab, new window, download) is left alone.
 */
export function onPlainClick(e: React.MouseEvent, go: () => void) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  go();
}

/**
 * Where you are in the map, and the row state that goes with it. Shared by
 * every view so they agree on what a path means: root first, the open node
 * last, a row child as `owner:key` after its owner.
 */
export function useMapNav() {
  const { LINKS, pathTo, nodeAt, name } = useMap();

  /** The longest prefix of `p` that is a real path — a stale link opens as
   *  far as it still resolves, rather than at nothing. */
  const valid = useCallback(
    (p: string[]) => {
      let k = p.length;
      while (k > 0 && !nodeAt(p.slice(0, k))) k--;
      return p.slice(0, k);
    },
    [nodeAt],
  );
  const [path, setPath] = useState<string[]>(() => valid(pathInUrl()));
  /** The row whose links are listed in the detail pane. */
  const [traced, setTraced] = useState<string | null>(null);

  // Path → URL. A move pushes an entry; the first sync only replaces, so
  // landing on the bare page doesn't leave an extra step to go back through.
  const synced = useRef(false);
  useEffect(() => {
    const want = hrefFor(name, path);
    if (window.location.search === want) {
      synced.current = true;
      return;
    }
    if (synced.current) window.history.pushState(null, "", want);
    else window.history.replaceState(null, "", want);
    synced.current = true;
  }, [path, name]);

  // URL → path, when the browser moves through history. Setting the path to
  // what the URL already says pushes nothing, so back never stacks entries.
  useEffect(() => {
    const onPop = () => {
      setTraced(null);
      setPath(valid(pathInUrl()));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [valid]);


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
  }, [pathTo]);

  const lit = useMemo(() => {
    if (!traced) return new Set<string>();
    const s = new Set<string>([traced]);
    for (const l of LINKS) {
      if (l.from === traced) s.add(l.to);
      if (l.to === traced) s.add(l.from);
    }
    return s;
  }, [traced, LINKS]);

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

  /** The href of the card at `p` on this map. */
  const href = useCallback((p: string[]) => hrefFor(name, p), [name]);

  return { path, setPath, go, traced, setTraced, jump, rowCtx, href };
}
