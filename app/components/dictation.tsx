"use client";

import { useEffect, useState } from "react";
import { cancelDictation, stopDictation, useDictation, useDictationKey } from "@/lib/dictate";
import { cn } from "@/lib/utils";

/**
 * On-device dictation's only chrome (lib/dictate.ts): a pill over the bottom
 * of the window while it listens or writes out, and for a moment after when
 * it put nothing in. Mounted once; it also holds the Option+Space key.
 */
export function Dictation() {
  useDictationKey();
  const d = useDictation();
  // The note on an empty result goes after a few seconds; a new one brings it back.
  const [faded, setFaded] = useState<typeof d | null>(null);
  useEffect(() => {
    if (d.phase !== "idle" || !d.error) return;
    const t = setTimeout(() => setFaded(d), 4000);
    return () => clearTimeout(t);
  }, [d]);
  if (d === faded || (d.phase === "idle" && !d.error)) return null;
  const listening = d.phase === "listening";
  return (
    <div
      role="status"
      className="pointer-events-none fixed inset-x-0 bottom-10 z-50 flex justify-center px-4"
    >
      <div className="pointer-events-auto flex items-center gap-2.5 rounded-full border border-border-gray bg-surface px-3.5 py-1.5 font-mono text-[11.5px] text-ink shadow-md">
        <span
          aria-hidden
          className={cn("h-2 w-2 rounded-full", listening ? "animate-pulse bg-clay-ink" : d.phase === "working" ? "bg-deep-green" : "bg-faint")}
        />
        {listening ? "Listening… let go of ⌥Space" : d.phase === "working" ? "Writing it out…" : d.error}
        {listening ? (
          <>
            <button type="button" onClick={() => void stopDictation()} className="cursor-pointer text-deep-green hover:underline">
              done
            </button>
            <button type="button" onClick={cancelDictation} className="cursor-pointer text-faint hover:text-ink">
              cancel
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}
