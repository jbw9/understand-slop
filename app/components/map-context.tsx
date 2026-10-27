"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { buildMap, type BuiltMap, type MapFile } from "@/lib/map";
import type { MapEntry } from "@/lib/maps";
import { changedPaths } from "@/lib/share";

/**
 * What the last rewrite of the map changed: the paths of every node it added
 * or altered (lib/share.ts), and when, so components/flash.tsx can light each
 * one that is on screen once.
 */
export interface Fresh {
  at: number;
  paths: ReadonlySet<string>;
}

const NONE: Fresh = { at: 0, paths: new Set() };

const MapContext = createContext<(BuiltMap & { maps: MapEntry[]; fresh: Fresh }) | null>(null);

/** How often the open map looks for a newer file of itself. */
const POLL_MS = 1000;

interface Live {
  /** The file the server last rendered, to tell a new one from a re-render. */
  prop: MapFile;
  map: BuiltMap;
  fresh: Fresh;
}

/** `map` rebuilt from `file`, keeping what did not change, and what did. */
function adopt(live: Live, file: MapFile): Live {
  const map = buildMap(file, live.map.name, live.map);
  const paths = changedPaths(live.map.TOP, map.TOP);
  if (!paths.length && map.LINKS === live.map.LINKS && map.RUN === live.map.RUN) return live;
  return { ...live, map, fresh: paths.length ? { at: Date.now(), paths: new Set(paths) } : live.fresh };
}

/**
 * The map on screen. Read on the server, built here, and followed while the
 * generator or an update rewrites it: a project's map polls `/api/map` and
 * takes each new file in place, so the sections being written appear as they
 * land and nothing else on the page moves.
 */
export function MapProvider({
  name,
  file,
  version,
  maps,
  children,
}: {
  name: string;
  file: MapFile;
  /** The file's version as the server read it; absent for a map that never changes (a demo, a static export). */
  version?: string;
  maps: MapEntry[];
  children: React.ReactNode;
}) {
  const [live, setLive] = useState<Live>(() => ({ prop: file, map: buildMap(file, name), fresh: NONE }));
  // A new render from the server — a refresh, or another map — is taken the
  // same way a poll is; another map starts over.
  if (live.prop !== file) {
    const next = live.map.name === name ? adopt(live, file) : { map: buildMap(file, name), fresh: NONE };
    setLive({ ...next, prop: file });
  }

  const since = useRef(version);
  useEffect(() => {
    since.current = version;
    if (version === undefined) return;
    let busy = false;
    const tick = () => {
      if (busy || document.hidden) return;
      busy = true;
      fetch(`/api/map?id=${encodeURIComponent(name)}&since=${encodeURIComponent(since.current ?? "")}`)
        .then((r) => r.json())
        .then((r: { version?: string; file?: MapFile } | null) => {
          if (r?.file) setLive((l) => (l.map.name === name ? adopt(l, r.file!) : l));
          if (r?.version) since.current = r.version;
        })
        .catch(() => {})
        .finally(() => (busy = false));
    };
    const timer = setInterval(tick, POLL_MS);
    return () => clearInterval(timer);
  }, [name, version]);

  const value = useMemo(() => ({ ...live.map, maps, fresh: live.fresh }), [live.map, live.fresh, maps]);
  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMap() {
  const m = useContext(MapContext);
  if (!m) throw new Error("useMap outside MapProvider");
  return m;
}

/** The map on screen, or null before the reader has any project to open. */
export function useMaybeMap() {
  return useContext(MapContext);
}
