"use client";

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { openSettings } from "@/lib/settings";
import { MapSwitcher, Trail, goTo, useLocation } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { openProjects } from "@/components/projects";
import { UNFOLLOWED, toggleWorkspace } from "@/components/workspace";
import { cn } from "@/lib/utils";

/**
 * The window's own title bar. The native one is off (`decorations: false` in
 * tauri.conf.json), so this draws where you are — the map switcher and the
 * trail of levels below it — the drag area and the window buttons, in the
 * page's palette rather than the desktop's. The map below has no header of its
 * own in the desktop app.
 *
 * Everything marked `data-tauri-drag-region` moves the window, and a double
 * click on it maximizes, as a native bar does. Buttons sit outside those
 * regions so a click on one is never read as the start of a drag. Outside the
 * desktop app (plain `next dev` in a browser) there is no window to drive, so
 * nothing is drawn.
 *
 * On a Mac the window keeps its own traffic lights (tauri.macos.conf.json
 * overlays them on this bar), so the bar leaves room for them on the left and
 * draws no buttons of its own on the right.
 */

const noSubscribe = () => () => {};

export function Titlebar() {
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const { name, maps, RUN } = useMap();
  const { path, crumbs } = useLocation();
  const [maximized, setMaximized] = useState(false);
  // Only read once `desktop` is true, which is never on the server.
  const mac = desktop && /Mac/.test(navigator.userAgent);

  useEffect(() => {
    if (!desktop) return;
    const win = getCurrentWindow();
    let live = true;
    const sync = () => win.isMaximized().then((m) => live && setMaximized(m));
    sync();
    const off = win.onResized(sync);
    return () => {
      live = false;
      off.then((f) => f());
    };
  }, [desktop]);

  if (!desktop) return null;
  const win = getCurrentWindow();
  return (
    <header
      data-tauri-drag-region
      className={cn(
        "flex h-9 shrink-0 select-none items-center border-b border-border-gray bg-surface-container-low",
        mac ? "pl-[78px]" : "pl-1.5",
      )}
    >
      {/* Outside the drag region, so a click opens it rather than moving the window. */}
      <label className="relative flex items-center">
        <MapSwitcher
          map={name}
          maps={maps}
          className="cursor-pointer appearance-none rounded-[5px] bg-transparent py-1 pl-2 pr-6 font-mono text-[11.5px] font-semibold text-ink transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-deep-green"
        />
        <svg
          aria-hidden
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="pointer-events-none absolute right-2 text-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m2.5 4 2.5 2.5L7.5 4" />
        </svg>
      </label>
      <Trail crumbs={crumbs} onJump={(d) => goTo(path.slice(0, d))} />
      <span data-tauri-drag-region className="ml-3 flex shrink-0 items-center gap-2 font-mono text-[10.5px] text-faint">
        <Hint k="esc">back</Hint>
        <Hint k="0">top</Hint>
      </span>
      <div data-tauri-drag-region className="h-full flex-1" />
      <MapUpdates key={name} id={name} root={RUN.root} local={maps.some((m) => m.id === name && m.local)} />
      <Control label="Projects — import one, or switch maps" onClick={() => openProjects()}>
        <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
      </Control>
      <Control label="Claude Code & terminal (Ctrl+`)" onClick={toggleWorkspace}>
        <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
        <path d="M4.5 6.5 6.5 8l-2 1.5M8.5 10h3" />
      </Control>
      <Control label="Settings" onClick={openSettings} className="mr-1.5">
        {/* Lucide's gear, drawn on 24 and scaled to the 16 grid; the stroke
            is scaled up to match so it reads as heavy as its neighbours. */}
        <g transform="scale(0.6667)" strokeWidth="1.875">
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </g>
      </Control>
      {mac ? null : (
        <>
          <Control label="Minimize" onClick={() => win.minimize()}>
            <path d="M4 8h8" />
          </Control>
          <Control label={maximized ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()}>
            {maximized ? (
              <>
                <rect x="3.5" y="5.5" width="7" height="7" rx="1" />
                <path d="M6 5.5V4.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1h-1" />
          </>
        ) : (
          <rect x="4" y="4" width="8" height="8" rx="1" />
        )}
      </Control>
      <Control label="Close" onClick={() => win.close()} danger>
        <path d="m4.5 4.5 7 7m0-7-7 7" />
      </Control>
        </>
      )}
    </header>
  );
}

function Control({
  label,
  onClick,
  danger,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-full w-11 cursor-pointer items-center justify-center text-muted-slate transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green",
        danger ? "hover:bg-clay-ink hover:text-white" : "hover:bg-surface-container hover:text-ink",
        className,
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function Hint({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <span data-tauri-drag-region className="flex items-center gap-1">
      <kbd className="rounded-[3px] border border-border-gray bg-surface px-1 text-[10px] text-muted-slate">{k}</kbd>
      {children}
    </span>
  );
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
 * the touched sections (lib/vault.ts) shows here while it runs, and the map
 * reloads the moment it is done. Only the user's own projects update; an
 * example describes some other copy of its code, so when an agent edits its
 * checkout this says so and offers to import it.
 */
function MapUpdates({ id, root, local }: { id: string; root?: string; local: boolean }) {
  const router = useRouter();
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
          if (!first && done && done !== seen.current) {
            router.refresh();
            setFresh(true);
          }
          if (done) seen.current = done;
          first = false;
        })
        .catch(() => {});
    void tick();
    const timer = setInterval(tick, 2000);
    return () => clearInterval(timer);
  }, [id, local, router]);

  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(false), 6000);
    return () => clearTimeout(t);
  }, [fresh]);

  if (unfollowed && root)
    return (
      <span data-tauri-drag-region className="mr-2 flex min-w-0 items-center gap-2 font-mono text-[10.5px] text-amber-ink">
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
      data-tauri-drag-region
      title={u.status === "failed" ? u.error : what}
      className={cn(
        "mr-2 max-w-[320px] truncate font-mono text-[10.5px]",
        u.status === "failed" ? "text-clay-ink" : u.status === "running" ? "text-amber-ink" : "text-deep-green",
      )}
    >
      {u.status === "running"
        ? "◷ Updating the map to what the agent changed or found…"
        : u.status === "failed"
          ? "✗ Map update failed"
          : `✓ Map updated: ${u.sections!.join(", ")}`}
    </span>
  );
}
