"use client";

import { Fragment, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Node } from "@/lib/data";
import { MapError, parseMap, type LoadedMap } from "@/lib/load";

/**
 * The map on screen, loaded at runtime.
 *
 * Two modes, decided by asking the server:
 *  - REPO: `slop` started the server on a repo, and /api/map serves its story
 *    merged with the code as it is now. Edits can be saved, and `reload`
 *    re-reads the map in place after a save.
 *  - DEMO: no repo (/api/map says `{repo: null}`). The bundled maps in /maps/ are
 *    read-only; `?map=<name>` picks one, else the first in /maps/index.json.
 * A file that fails validation is shown as its list of problems — the point
 * of checking at all is that a bad file (an LLM's, most likely) says what is
 * wrong instead of rendering something subtly broken.
 */

export interface MapEntry {
  name: string;
  title?: string;
}

export type MapData = LoadedMap & {
  name: string;
  byId: Map<string, Node>;
  titleOf: (id: string) => string;
  /** Every map in /maps/index.json, for the switcher. */
  maps: MapEntry[];
  switchTo: (name: string) => void;
  /** True when serving a repo: edits can be written back to its files. */
  editable: boolean;
  /** Re-read the map without leaving the view — after a save, say. */
  reload: () => Promise<void>;
};

const Ctx = createContext<MapData | null>(null);

export function useMap(): MapData {
  const m = useContext(Ctx);
  if (!m) throw new Error("useMap must be used inside <MapLoader>");
  return m;
}

type Status =
  | { kind: "loading" }
  | { kind: "ready"; map: LoadedMap }
  | { kind: "failed"; problems: string[] };

/** /api/map, parsed: the repo's map, or null when there is no repo. */
async function fetchRepoMap(): Promise<{ name: string; map: LoadedMap } | null> {
  const r = await fetch("/api/map", { cache: "no-store" });
  const json = await r.json();
  if (r.ok && json.repo === null) return null;
  if (!r.ok) throw new MapError(json.problems ?? [`/api/map: HTTP ${r.status}`]);
  return { name: json.repo.name, map: parseMap(json) };
}

export function MapLoader({ children }: { children: React.ReactNode }) {
  const [maps, setMaps] = useState<MapEntry[] | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [editable, setEditable] = useState(false);

  const fail = (e: unknown, where: string) =>
    setStatus({ kind: "failed", problems: e instanceof MapError ? e.problems : [`${where}: ${String(e)}`] });

  // A repo if the server has one; else the list of demos, then the one the
  // URL names (or the first).
  useEffect(() => {
    let live = true;
    fetchRepoMap()
      .then(async (repo) => {
        if (!live) return;
        if (repo) {
          setEditable(true);
          setMaps([{ name: repo.name }]);
          setName(repo.name);
          setStatus({ kind: "ready", map: repo.map });
          return;
        }
        const list = (await (await fetch("/maps/index.json")).json()) as MapEntry[];
        if (!live) return;
        setMaps(list);
        const asked = new URLSearchParams(window.location.search).get("map");
        setName(list.some((m) => m.name === asked) ? asked : (list[0]?.name ?? null));
      })
      .catch((e) => live && fail(e, "/api/map"));
    return () => {
      live = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!editable) return;
    const repo = await fetchRepoMap();
    if (repo) setStatus({ kind: "ready", map: repo.map });
  }, [editable]);

  // Demo maps are fetched by name; a repo's map arrived with the probe above.
  useEffect(() => {
    if (!name || editable) return;
    let live = true;
    // Reset in a callback rather than the effect body, so the effect only
    // subscribes to the fetch.
    queueMicrotask(() => live && setStatus({ kind: "loading" }));
    fetch(`/maps/${encodeURIComponent(name)}.map.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((json) => live && setStatus({ kind: "ready", map: parseMap(json) }))
      .catch((e) =>
        live &&
        setStatus({
          kind: "failed",
          problems: e instanceof MapError ? e.problems : [`/maps/${name}.map.json: ${String(e)}`],
        }),
      );
    return () => {
      live = false;
    };
  }, [name, editable]);

  // Switching codebase is a history entry like any other move, and going
  // back across one switches the map back.
  const switchTo = useCallback((next: string) => {
    window.history.pushState(null, "", `?map=${encodeURIComponent(next)}`);
    setName(next);
  }, []);
  useEffect(() => {
    if (!maps) return;
    const onPop = () => {
      const asked = new URLSearchParams(window.location.search).get("map");
      const next = maps.some((m) => m.name === asked) ? asked : (maps[0]?.name ?? null);
      setName((cur) => (cur === next ? cur : next));
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [maps]);

  const value = useMemo<MapData | null>(() => {
    if (status.kind !== "ready" || !name) return null;
    const byId = new Map(status.map.allNodes().map((n) => [n.id, n]));
    return {
      ...status.map,
      name,
      byId,
      titleOf: (id: string) => byId.get(id)?.title ?? id,
      maps: maps ?? [],
      switchTo,
      editable,
      reload,
    };
  }, [status, name, maps, switchTo, editable, reload]);

  if (status.kind === "failed") {
    return (
      <main className="min-h-dvh bg-warm-cream px-6 py-8">
        <p className="text-[15px] font-semibold text-ink">This map file couldn&apos;t be loaded</p>
        <p className="mt-1 font-mono text-[11px] text-faint">
          {editable || !name ? ".slop/story.json" : `/maps/${name}.map.json`}
        </p>
        {maps && maps.length > 1 ? (
          <p className="mt-3 flex flex-wrap gap-2 text-[11.5px] text-on-surface-variant">
            Open another map:
            {maps
              .filter((m) => m.name !== name)
              .map((m) => (
                <button
                  key={m.name}
                  type="button"
                  onClick={() => switchTo(m.name)}
                  className="cursor-pointer font-semibold text-deep-green underline-offset-2 hover:underline"
                >
                  {m.title ?? m.name}
                </button>
              ))}
          </p>
        ) : null}
        <ul className="mt-4 flex max-w-[900px] flex-col gap-1">
          {status.problems.map((p, i) => (
            <li key={i} className="font-mono text-[11px] leading-relaxed text-clay-ink">
              {p}
            </li>
          ))}
        </ul>
      </main>
    );
  }
  if (!value) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-warm-cream">
        <p className="font-mono text-[11px] text-faint">loading map…</p>
      </main>
    );
  }
  return (
    <Ctx.Provider value={value}>
      {/* Keyed by map, so switching starts the view (and its edits) fresh. */}
      <Fragment key={value.name}>{children}</Fragment>
    </Ctx.Provider>
  );
}
