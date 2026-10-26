"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export interface DemoMap {
  id: string;
  label: string;
  files: number;
  elapsed: string;
}

/**
 * The real canvas, framed. Each tab reloads the iframe on another committed
 * map, so what a visitor explores is the product itself, not a recording.
 */
export function LandingDemo({ maps }: { maps: DemoMap[] }) {
  const [open, setOpen] = useState(maps[0].id);
  const [loaded, setLoaded] = useState<string | null>(null);
  const current = maps.find((m) => m.id === open)!;

  return (
    <div>
      <div role="tablist" aria-label="Repository" className="mb-4 flex flex-wrap justify-center gap-1">
        {maps.map((m) => (
          <button
            key={m.id}
            role="tab"
            aria-selected={m.id === open}
            onClick={() => setOpen(m.id)}
            className={cn(
              "rounded-[8px] px-3 py-1.5 text-[13px] transition-[background-color,color] focus-visible:outline-2 focus-visible:outline-deep-green",
              m.id === open
                ? "bg-pure-white font-medium text-ink shadow-panel ring-1 ring-border-gray"
                : "text-muted-slate hover:bg-surface-container-low hover:text-ink",
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-[20px] border bg-pure-white shadow-lift">
        <div className="flex items-center gap-3 border-b bg-surface px-4 py-2.5">
          <div aria-hidden className="flex gap-1.5">
            <span className="size-2.5 rounded-full bg-surface-dim" />
            <span className="size-2.5 rounded-full bg-surface-dim" />
            <span className="size-2.5 rounded-full bg-surface-dim" />
          </div>
          <span className="flex-1 truncate text-center font-mono text-[11.5px] text-faint">
            {current.id === "understand-slop" ? "TBD" : current.id}
          </span>
          <span className="hidden font-mono text-[11px] text-faint tnum sm:block">
            {current.files} files · mapped in {current.elapsed}
          </span>
        </div>
        <div className="relative h-[560px] bg-warm-cream sm:h-[680px]">
          {loaded !== open ? (
            <div className="absolute inset-0 grid place-items-center font-mono text-[11.5px] text-faint">
              loading {current.id}…
            </div>
          ) : null}
          <iframe
            key={open}
            src={`/?map=${open}&embed`}
            title={`${current.label}, explored`}
            onLoad={() => setLoaded(open)}
            className={cn(
              "absolute inset-0 h-full w-full transition-opacity duration-300",
              loaded === open ? "opacity-100" : "opacity-0",
            )}
          />
        </div>
      </div>
      <p className="mt-3 text-center text-[12.5px] text-muted-slate">
        Live, not a recording. Click any step to go a level deeper; <kbd className="font-mono text-[11px]">esc</kbd>{" "}
        goes back.
      </p>
    </div>
  );
}
