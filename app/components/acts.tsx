"use client";

import { useEffect, useState } from "react";
import { goTo } from "@/components/chrome";
import { useDiff } from "@/components/diff";
import { openDiffPanel } from "@/components/diff-panel";
import { useMap } from "@/components/map-context";
import { findSection, onAct } from "@/lib/act";

/**
 * Claude moving the map (lib/act.ts).
 *
 * Mounted once, inside the diff provider, because the two things Claude can do
 * need what only this level of the tree has: the map, to turn a section's name
 * into a path, and the diff's `setRange`, to point the comparison somewhere.
 *
 * A name that resolves to nothing says so, briefly, instead of moving. Claude
 * writes the name from a map it was handed, so a miss means the map changed
 * under it or it reached for a section that was never there — and silently
 * landing the reader somewhere plausible in the middle of an explanation is
 * the one outcome worse than not moving at all.
 */
export function Acts() {
  const map = useMap();
  const diff = useDiff();
  const [missed, setMissed] = useState<string | null>(null);

  useEffect(() => {
    const t = missed ? setTimeout(() => setMissed(null), 4000) : undefined;
    return () => clearTimeout(t);
  }, [missed]);

  // `diff` changes identity whenever the comparison does, so the handler is
  // re-bound rather than closing over a stale `setRange`.
  useEffect(
    () =>
      onAct((a) => {
        if (a.verb === "section") {
          const path = findSection(map, a.section);
          if (!path) return setMissed(a.section);
          return goTo(path);
        }
        // Empty `from` and null `to` are the defaults the diff API already
        // has for an absent parameter, so they pass straight through as
        // undefined. Resolving a phrase like "last commit by someone" is
        // lib/diff.ts's job, not this one's.
        diff?.setRange(a.from || undefined, a.to ?? undefined);
        openDiffPanel();
      }),
    [map, diff],
  );

  if (!missed) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center">
      <p className="rounded-[8px] border border-amber-line bg-amber-surface px-3 py-2 text-[12.5px] text-amber-ink shadow-sm">
        No section on this map is called “{missed}”.
      </p>
    </div>
  );
}
