"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AgentIcon } from "@/components/agents";
import { Kbd, keys, useMac } from "@/components/button";
import { useMap } from "@/components/map-context";
import { openReview } from "@/components/diff";
import { openFiles, useFiles } from "@/components/files";
import { openPalette } from "@/components/palette";
import { openProjects } from "@/components/projects";
import { UNFOLLOWED, toggleWorkspace, followTurn } from "@/components/workspace";
import { coverage } from "@/lib/coverage";
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
  const files = useFiles();
  const covered = useMemo(() => (files?.index ? coverage(files.index, L0) : null), [files, L0]);
  const mac = useMac();

  return (
    <footer data-chrome="bar" className="flex h-6 shrink-0 select-none items-center gap-0.5 border-t border-border-gray bg-surface-container-low px-2 text-[11.5px] text-muted-slate">
      <Item title="The commit this map describes" mono>
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
          <circle cx="8" cy="8" r="2.5" />
          <path d="M1 8h4.5M10.5 8H15" />
        </svg>
        {RUN.commit?.slice(0, 7) ?? "no commit"}
      </Item>
      {covered ? (
        <Item
          title="Top-level symbols a level opens, of those the map must explain — click for every file"
          onClick={() => openFiles(covered.gaps.length ? "gaps" : "all")}
          className={covered.gaps.length ? "text-amber-ink" : undefined}
        >
          {covered.explained}/{covered.symbols} explained
        </Item>
      ) : (
        <Item title="Files the map read — click for every file" onClick={() => openFiles()}>
          {RUN.files} files
        </Item>
      )}
      {files?.added.length ? (
        <Item title="Files added since the map was made — click to list them" onClick={() => openFiles("added")} className="text-amber-ink">
          {files.added.length} not on the map yet
        </Item>
      ) : null}
      <Sep />
      <Item title={`Levels in the map — ${keys(mac, "P")} to go to one`} onClick={() => openPalette()}>
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
        Go to <Kbd className={KEY}>{keys(mac, "P")}</Kbd>
      </Item>
      {STATIC_MAP ? (
        <Item title="Ask Claude about this code" onClick={toggleWorkspace}>
          <AgentIcon id="claude" />
          {/* A published page takes Control+` only (components/claude-web.tsx). */}
          Claude <Kbd className={KEY}>{keys(mac, "`", { ctrl: true })}</Kbd>
        </Item>
      ) : (
        <Item title="Claude Code & terminal" onClick={toggleWorkspace}>
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
            <path d="M4.5 6.5 6.5 8l-2 1.5M8.5 10h3" />
          </svg>
          Workspace <Kbd className={KEY}>{keys(mac, "`")}</Kbd>
        </Item>
      )}
    </footer>
  );
}

/** A key, sized to the bar. */
const KEY = "h-[15px] min-w-[15px] text-[10px]";

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
    "flex h-full shrink-0 items-center gap-1.5 px-1.5",
    mono && "font-mono text-[11px]",
    onClick && "cursor-pointer hover:bg-surface-container hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
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

/** How long the changed files must stay as they are before the map follows them by itself. */
const SETTLE = 120_000;

interface Update {
  status: "running" | "done" | "failed";
  finishedAt?: string;
  changed?: string[];
  sections?: string[];
  error?: string;
}

/**
 * The section ids an update is rewriting right now, for the open level to say
 * so where the reader is looking (components/canvas.tsx): the status bar alone
 * was missed, and a minute with nothing changing read as the update not working.
 */
let redoing: string[] = [];
const redoListeners = new Set<() => void>();
function setRedoing(next: string[]) {
  if (next.join("\n") === redoing.join("\n")) return;
  redoing = next;
  redoListeners.forEach((l) => l());
}
const NONE: string[] = [];
export function useRedoing(): string[] {
  return useSyncExternalStore(
    (l) => (redoListeners.add(l), () => redoListeners.delete(l)),
    () => redoing,
    () => NONE,
  );
}

/**
 * Follows the open map while an agent changes its code: an update redoing
 * the touched sections (lib/vault.ts) shows here while it runs. The map takes
 * each section as it lands by itself (components/map-context.tsx); this only
 * says what is happening. Only the user's own projects update; an
 * example describes some other copy of its code, so when an agent edits its
 * checkout this says so and offers to import it.
 *
 * Edits made outside a Bluprint tab (another editor, a pull) never ask for an
 * update, so between updates this says how far the code has moved from what
 * the map describes, and updates it once those files have stopped changing
 * for SETTLE: long enough that an agent mid-turn (whose turn updates the map
 * when it ends) is not raced. The same change is never retried after it
 * failed, since each try is a paid run.
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
        .then((p: { update: Update | null; redoing?: string[] } | null) => {
          const next = p?.update ?? null;
          setU(next);
          setRedoing(next?.status === "running" ? (p?.redoing ?? []) : []);
          const done = next?.status !== "running" ? next?.finishedAt : undefined;
          if (!first && done && done !== seen.current) setFresh(true);
          if (done) seen.current = done;
          first = false;
        })
        .catch(() => {});
    void tick();
    const timer = setInterval(tick, 2000);
    return () => (clearInterval(timer), setRedoing([]));
  }, [id, local]);

  const [behind, setBehind] = useState<string[]>([]);
  // The change last updated for, so a failed one is not paid for again.
  const [tried, setTried] = useState("");
  const quiet = useRef({ sig: "", since: 0, tried: "", running: false });
  const running = u?.status === "running";
  useEffect(() => {
    quiet.current.running = running;
  }, [running]);
  const follow = (sig: string) => {
    quiet.current.tried = sig;
    setTried(sig);
    if (root) void followTurn(root, { transcript: null, corrections: [] });
  };
  useEffect(() => {
    if (!local) return;
    const tick = () =>
      fetch(`/api/files?map=${encodeURIComponent(id)}&behind=1`)
        .then((r) => (r.ok ? r.json() : null))
        .then((r: { behind: string[] } | null) => {
          if (!r) return;
          setBehind(r.behind);
          const q = quiet.current;
          const sig = r.behind.join("\n");
          if (sig !== q.sig) Object.assign(q, { sig, since: Date.now() });
          else if (sig && !q.running && q.tried !== sig && Date.now() - q.since >= SETTLE) follow(sig);
        })
        .catch(() => {});
    void tick();
    const timer = setInterval(tick, 15000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- follow reads only refs and root, which `id` pins
  }, [id, local, u?.finishedAt]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(false), 15000);
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
          className="shrink-0 cursor-pointer text-accent underline"
        >
          Import to keep it updated
        </button>
        <button type="button" onClick={() => setUnfollowed(false)} aria-label="Dismiss" className="shrink-0 cursor-pointer text-faint hover:text-ink">
          ×
        </button>
      </span>
    );
  // A turn that changed nothing the map covers passes silently.
  if (!u || (u.status === "done" && (!fresh || !u.sections?.length)))
    return behind.length && root ? (
      <span className="mr-2 flex min-w-0 items-center gap-2 text-amber-ink">
        <span className="truncate" title={behind.join("\n")}>
          Map is behind: {behind.length} {behind.length === 1 ? "file" : "files"} changed
          {tried === behind.join("\n") ? "" : " · updates when edits settle"}
        </span>
        <button
          type="button"
          onClick={() => follow(behind.join("\n"))}
          className="shrink-0 cursor-pointer text-accent underline"
        >
          Update now
        </button>
      </span>
    ) : null;
  const what = u.sections?.length ? u.sections.join(", ") : u.changed?.join(", ");
  return (
    <span
      title={u.status === "failed" ? u.error : what}
      className={cn(
        "mr-2 flex min-w-0 max-w-[420px] items-center gap-1.5 truncate",
        u.status === "failed" ? "text-clay-ink" : u.status === "running" ? "text-amber-ink" : "text-accent",
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
      {u.status === "done" ? (
        <button type="button" onClick={() => (setFresh(false), openReview("turn:latest"))} className="shrink-0 cursor-pointer underline">
          see what changed
        </button>
      ) : null}
    </span>
  );
}
