"use client";

import { createContext, useContext, useMemo } from "react";
import { buildMap, type BuiltMap, type MapFile } from "@/lib/map";
import type { MapEntry } from "@/lib/maps";

const MapContext = createContext<(BuiltMap & { maps: MapEntry[] }) | null>(null);

/** The map on screen. Read on the server, built once here. */
export function MapProvider({
  name,
  file,
  maps,
  children,
}: {
  name: string;
  file: MapFile;
  maps: MapEntry[];
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ ...buildMap(file, name), maps }), [file, name, maps]);
  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}

export function useMap() {
  const m = useContext(MapContext);
  if (!m) throw new Error("useMap outside MapProvider");
  return m;
}
