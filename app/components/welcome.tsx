"use client";

import { useRouter } from "next/navigation";
import { Button, Kbd } from "@/components/button";
import { openProjects } from "@/components/projects";
import type { MapEntry } from "@/lib/maps";

/**
 * The blank page: what the window shows with no project open — none asked
 * for, the one asked for is gone, or the open one was just deleted. It lists
 * the projects to open; with none yet, it is the welcome.
 */
export function NoProject({ maps }: { maps: MapEntry[] }) {
  const router = useRouter();
  if (!maps.length) return <Welcome />;
  return (
    <main className="flex min-h-0 flex-1 justify-center overflow-y-auto bg-warm-cream px-6 py-16">
      <div className="w-full max-w-[520px]">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Open a project</h1>
        <ul className="mt-5 flex flex-col divide-y divide-border-gray overflow-hidden rounded-[8px] border border-border-gray bg-pure-white">
          {maps.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                onClick={() => router.push(`/?map=${encodeURIComponent(m.id)}`)}
                className="flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-deep-green"
              >
                <span className="min-w-0 truncate font-mono text-[13px] font-semibold text-ink">{m.label}</span>
                <span aria-hidden className="ml-auto text-[11px] text-faint">▸</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <Button onClick={() => openProjects()}>Start or import a project</Button>
        </div>
      </div>
    </main>
  );
}

/**
 * The window before the reader has a project. The app ships no example maps,
 * so the first thing to do is make one: start a new folder, or point it at a
 * repository already on this machine.
 */
export function Welcome() {
  return (
    <main className="flex min-h-0 flex-1 items-center justify-center bg-warm-cream px-6">
      <div className="max-w-[440px] text-center">
        <h1 className="text-[22px] font-semibold tracking-[-0.02em] text-ink">Map a repository</h1>
        <p className="mt-2 text-[14px] leading-relaxed text-on-surface-variant">
          Point it at code on this machine. Claude Code reads it and writes a map you can open a level at a time,
          down to the line.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="primary" onClick={() => openProjects()}>
            Start or import a project
          </Button>
        </div>
        <p className="mt-6 flex items-center justify-center gap-1.5 text-[12px] text-faint">
          Once it is mapped, <Kbd>Ctrl K</Kbd> goes to any level.
        </p>
      </div>
    </main>
  );
}
