"use client";

import { useRouter } from "next/navigation";
import { Kbd } from "@/components/button";
import { newProject, openFolder, openProjects } from "@/components/projects";
import { cn } from "@/lib/utils";
import type { MapEntry } from "@/lib/maps";

/**
 * The blank page: what the window shows with no project open — none asked
 * for, the one asked for is gone, or the open one was just deleted. Laid out
 * as VS Code's welcome is: Start on one side, Recent on the other, which with
 * no projects yet is just Start.
 */
export function NoProject({ maps }: { maps: MapEntry[] }) {
  const router = useRouter();
  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-paper px-6 py-16">
      <div className="w-full max-w-[640px]">
        <h1 className="font-display text-[32px] font-normal leading-[1.05] tracking-[-0.016em] text-ink">Map a repository</h1>
        <p className="mt-1 text-[14px] text-on-surface-variant">Claude Code reads it and writes a map you can open a level at a time, down to the line.</p>
        <div className="mt-8 grid gap-10 sm:grid-cols-2">
          <section>
            <h2 className="mb-2 text-[13px] font-semibold text-ink">Start</h2>
            <ul className="flex flex-col gap-1.5 text-[13px]">
              <li>
                <button type="button" onClick={() => void openFolder()} className={LINK}>
                  Open Folder…
                </button>
              </li>
              <li>
                <button type="button" onClick={newProject} className={LINK}>
                  New Project…
                </button>
              </li>
              {maps.length ? (
                <li>
                  <button type="button" onClick={() => openProjects()} className={LINK}>
                    Manage Projects…
                  </button>
                </li>
              ) : null}
            </ul>
          </section>
          {maps.length ? (
            <section>
              <h2 className="mb-2 text-[13px] font-semibold text-ink">Recent</h2>
              <ul className="flex flex-col gap-1.5 text-[13px]">
                {maps.map((m) => (
                  <li key={m.id}>
                    <button type="button" onClick={() => router.push(`/?map=${encodeURIComponent(m.id)}`)} className={cn(LINK, "max-w-full truncate font-mono")}>
                      {m.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
        <p className="mt-10 flex items-center gap-1.5 text-[12px] text-faint">
          Once it is mapped, <Kbd>Ctrl K</Kbd> goes to any level.
        </p>
      </div>
    </main>
  );
}

const LINK = "cursor-pointer text-left text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent";
