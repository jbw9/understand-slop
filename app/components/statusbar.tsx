"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgentIcon } from "@/components/agents";
import { Kbd } from "@/components/button";
import { useMap } from "@/components/map-context";
import { openPalette } from "@/components/palette";
import { openProjects } from "@/components/projects";
import { UNFOLLOWED, toggleWorkspace } from "@/components/workspace";
import type { Node } from "@/lib/data";
import { STATIC_MAP } from "@/lib/source";
import { cn } from "@/lib/utils";

/**
 * The line along the bottom of the window: what is true of the whole map,
 * whatever level is open. Which commit it describes, how much of it is not
 * certain, whether an update is running, and the two keys that get you
 * anywhere. It is the one place this lives, so no level has to repeat it.
 */
export function StatusBar() {
  const { name, maps, RUN, L0, TOP } = useMap();
  const local = maps.some((m) => m.id === name && m.local);

  const counts = useMemo(() => {
    let levels = 0;
    let unsure = 0;
    let problems = 0;
    const walk = (nodes: Node[]) => {
      for (const n of nodes) {
        levels++;
        if (n.state !== "derived") unsure++;
        problems += n.issues?.length ?? 0;
        walk(n.children ?? []);
      }
    };
    walk(L0);
    // The repository is a level too (D60): what it is unsure of counts, as
    // the lists these open include it.
    if (TOP.state !== "derived") unsure++;
    problems += TOP.issues?.length ?? 0;
    return { levels, unsure, problems };
  }, [L0, TOP]);

  return (
    <footer data-chrome className="flex h-6 shrink-0 select-none items-center gap-0.5 border-t border-border-gray bg-surface-container-low px-2 text-[11.5px] text-muted-slate">
      <Item title="The commit this map describes" mono>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M1 8h4.5M10.5 8H15" />
        </svg>
        {RUN.commit?.slice(0, 7) ?? "no commit"}
      </Item>
      <Item title="Files the map read">{RUN.files} files</Item>
      <Sep />
      <Item title="Levels in the map — Ctrl+K to go to one" onClick={() => openPalette()}>
        {counts.levels} levels
      </Item>
      {counts.unsure ? (
        <Item title="Levels the map is not certain about — click to list them" onClick={() => openPalette("unsure")} className="text-amber-ink">
          <span aria-hidden className="size-[7px] rounded-full bg-amber-ink/80" />
          {counts.unsure} not certain
        </Item>
      ) : null}
      {counts.problems ? (
        <Item title="Problems the map found in the code — click to list them" onClick={() => openPalette("problems")} className="text-clay-ink">
          <span aria-hidden>⚠</span>
          {counts.problems} {counts.problems === 1 ? "problem" : "problems"}
        </Item>
      ) : null}
      <span className="min-w-0 flex-1" />
      <MapUpdates key={name} id={name} root={RUN.root} local={local} />
      <Item title="Go to a level, or run an action" onClick={() => openPalette()}>
        Go to <Kbd className="h-[15px] min-w-[15px] text-[10px]">Ctrl K</Kbd>
      </Item>
      {STATIC_MAP ? (
        <Item title="Ask Claude about this code" onClick={toggleWorkspace}>
          <AgentIcon id="claude" />
          Claude <Kbd className="h-[15px] min-w-[15px] text-[10px]">Ctrl `</Kbd>
        </Item>
      ) : (
        <Item title="Claude Code & terminal" onClick={toggleWorkspace}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
            <path d="M4.5 6.5 6.5 8l-2 1.5M8.5 10h3" />
          </svg>
          Workspace <Kbd className="h-[15px] min-w-[15px] text-[10px]">Ctrl `</Kbd>
        </Item>
      )}
    </footer>
  );
}

function Item({
  children,
  title,
  onClick,
  mono,
  className,
}: {
  children: React.ReactNode;
  title: string;
  onClick?: () => void;
  mono?: boolean;
  className?: string;
}) {
  const cls = cn(
    "flex h-full shrink-0 items-center gap-1.5 rounded-[2px] px-1.5",
    mono && "font-mono text-[11px]",
    onClick && "cursor-pointer hover:bg-surface-container hover:text-ink",
    className,
  );
  return onClick ? (
    <button type="button" title={title} onClick={onClick} className={cls}>
      {children}
    </button>
  ) : (
    <span title={title} className={cls}>
      {children}
    </span>
  );
}

function Sep() {
  return <span aria-hidden className="mx-1 h-3 w-px bg-border-strong" />;
}

interface Update {
  status: "running" | "done" | "failed";
  finishedAt?: string;
  changed?: string[];
  sections?: string[];
  error?: string;
}

/**
 * Follows the open map while an agent changes its code: an update redoing
 * the touched sections (lib/vault.ts) shows here while it runs. The map takes
 * each section as it lands by itself (components/map-context.tsx); this only
 * says what is happening. Only the user's own projects update; an
 * example describes some other copy of its code, so when an agent edits its
 * checkout this says so and offers to import it.
 */
function MapUpdates({ id, root, local }: { id: string; root?: string; local: boolean }) {
  const [u, setU] = useState<Update | null>(null);
  const [unfollowed, setUnfollowed] = useState(false);

  useEffect(() => {
    const on = (e: Event) => (e as CustomEvent<string>).detail === root && setUnfollowed(true);
    window.addEventListener(UNFOLLOWED, on);
    return () => window.removeEventListener(UNFOLLOWED, on);
  }, [root]);
  // The last finished update already on screen, so only a new one reloads.
  const seen = useRef<string | undefined>(undefined);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    if (!local) return;
    let first = true;
    const tick = () =>
      fetch(`/api/projects?id=${encodeURIComponent(id)}`)
        .then((r) => r.json())
        .then((p: { update: Update | null } | null) => {
          const next = p?.update ?? null;
          setU(next);
          const done = next?.status !== "running" ? next?.finishedAt : undefined;
          if (!first && done && done !== seen.current) setFresh(true);
          if (done) seen.current = done;
          first = false;
        })
        .catch(() => {});
    void tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [id, local]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(false), 6000);
    return () => clearTimeout(t);
  }, [fresh]);

  if (unfollowed && root)
    return (
      <span className="mr-2 flex min-w-0 items-center gap-2 text-amber-ink">
        <span className="truncate" title="This map was made from another copy of the code, so it cannot follow edits here.">
          This map doesn&apos;t follow edits
        </span>
        <button
          type="button"
          onClick={() => {
            setUnfollowed(false);
            openProjects(root);
          }}
          className="shrink-0 cursor-pointer text-deep-green underline"
        >
          Import to keep it updated
        </button>
        <button type="button" onClick={() => setUnfollowed(false)} aria-label="Dismiss" className="shrink-0 cursor-pointer text-faint hover:text-ink">
          ×
        </button>
      </span>
    );
  // A turn that changed nothing the map covers passes silently.
  if (!u || (u.status === "done" && (!fresh || !u.sections?.length))) return null;
  const what = u.sections?.length ? u.sections.join(", ") : u.changed?.join(", ");
  return (
    <span
      title={u.status === "failed" ? u.error : what}
      className={cn(
        "mr-2 flex min-w-0 max-w-[420px] items-center gap-1.5 truncate",
        u.status === "failed" ? "text-clay-ink" : u.status === "running" ? "text-amber-ink" : "text-deep-green",
      )}
    >
      {u.status === "running" ? <span aria-hidden className="size-[7px] shrink-0 animate-pulse rounded-full bg-amber-ink" /> : null}
      <span className="truncate">
        {u.status === "running"
          ? "Updating the map to what the agent changed…"
          : u.status === "failed"
            ? "✗ Map update failed"
            : `✓ Map updated: ${u.sections!.join(", ")}`}
      </span>
    </span>
  );
}
