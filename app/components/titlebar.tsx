"use client";

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, useSyncExternalStore } from "react";
import { openSettings } from "@/lib/settings";
import { openPalette } from "@/components/palette";
import { useMap } from "@/components/map-context";
import { openProjects } from "@/components/projects";
import { openAudit } from "@/components/audit";
import { openHistory } from "@/components/history";
import { openDiff } from "@/components/diff";
import { toggleWorkspace } from "@/components/workspace";
import { DocIcon } from "@/components/docs";
import { LOGOS } from "@/components/agents";
import { STATIC_MAP } from "@/lib/source";
import { cn } from "@/lib/utils";

/**
 * The window's own title bar. The native one is off (`decorations: false` in
 * tauri.conf.json), so this draws the map's name, which switches maps, the tools, and the window
 * buttons, in the page's palette rather than the desktop's. The map below has no header of its
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

/**
 * `bare` is the window with no map open (components/welcome.tsx): the frame,
 * the projects and settings buttons, and the window buttons, so it can still
 * be moved and closed.
 */
export function Titlebar({ bare }: { bare?: boolean }) {
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
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
    // Two columns: the right one never gives up its buttons; when the window
    // is too narrow for both, the map's name truncates first.
    <header
      data-tauri-drag-region
      data-chrome
      className="grid h-9 shrink-0 select-none grid-cols-[minmax(0,1fr)_max-content] items-center border-b border-border-gray bg-surface-container-low"
    >
      {/* The Mac's traffic lights take the left edge. */}
      <div data-tauri-drag-region className={cn("flex h-full min-w-0 items-center", mac ? "pl-[78px]" : "pl-1.5")}>
        {bare ? (
          <span data-tauri-drag-region className="px-2 font-mono text-[11.5px] font-semibold text-ink">
            Mira
          </span>
        ) : (
          <Where />
        )}
      </div>
      <div data-tauri-drag-region className="flex h-full items-center justify-end">
        <Control label="Projects — start a new one, or switch maps" onClick={() => openProjects()}>
          <path d="M1.5 4.5a1 1 0 0 1 1-1h3.6l1.5 1.5h5.9a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" />
        </Control>
        {bare ? null : <MapTools />}
        <span aria-hidden className="mx-1 h-4 w-px bg-border-strong" />
        {bare ? null : (
          <Control label={STATIC_MAP ? "Claude (Ctrl+`)" : "Claude Code & terminal (Ctrl+`)"} onClick={toggleWorkspace}>
            {/* A published page has no terminal, only Claude (components/claude-web.tsx). */}
            {STATIC_MAP ? (
              <path d={LOGOS.claude.d} transform="scale(0.6667)" fill={LOGOS.claude.color} stroke="none" />
            ) : (
              <>
                <rect x="1.5" y="2.5" width="13" height="11" rx="2" />
                <path d="M4.5 6.5 6.5 8l-2 1.5M8.5 10h3" />
              </>
            )}
          </Control>
        )}
        <Control label="Settings" onClick={openSettings}>
          {/* Lucide's gear, drawn on 24 and scaled to the 16 grid; the stroke
              is scaled up to match so it reads as heavy as its neighbours. */}
          <g transform="scale(0.6667)" strokeWidth="1.875">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
          </g>
        </Control>
        {mac ? null : (
          <>
            <span aria-hidden className="mx-1 h-4 w-px bg-border-strong" />
            <Control win label="Minimize" onClick={() => win.minimize()}>
              <path d="M4 8h8" />
            </Control>
            <Control win label={maximized ? "Restore" : "Maximize"} onClick={() => win.toggleMaximize()}>
              {maximized ? (
                <>
                  <rect x="3.5" y="5.5" width="7" height="7" rx="1" />
                  <path d="M6 5.5V4.5a1 1 0 0 1 1-1h4.5a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1h-1" />
            </>
          ) : (
            <rect x="4" y="4" width="8" height="8" rx="1" />
          )}
        </Control>
        <Control win label="Close" onClick={() => win.close()} danger>
          <path d="m4.5 4.5 7 7m0-7-7 7" />
        </Control>
          </>
        )}
      </div>
    </header>
  );
}

/** The map's name, which switches maps. Where you are inside it is the tabs' to say (components/tabs.tsx). */
function Where() {
  const { name } = useMap();
  return (
    <>
      {/* Outside the drag region, so a click opens it rather than moving the window. */}
      <button
        type="button"
        onClick={() => openPalette("maps")}
        title="Switch map"
        className="flex h-6 shrink-0 cursor-pointer items-center gap-1.5 rounded-[2px] px-2 font-mono text-[11.5px] font-semibold text-ink transition-colors hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-deep-green"
      >
        {name}
        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="text-faint">
          <path d="m2.5 4 2.5 2.5L7.5 4" />
        </svg>
      </button>
    </>
  );
}

/** The tools that act on the open map. */
function MapTools() {
  const { name } = useMap();
  return (
    <>
      <Control label="What changed in the code — red is gone, green is new" onClick={openDiff}>
        {/* Two states side by side: the old and the new. */}
        <path d="M5.5 13V5.5a2 2 0 0 1 2-2h3M10.5 3l2 2.5-2 2.5" />
        <circle cx="5.5" cy="13" r="1.4" />
      </Control>
      <Control label="How this map was made — what the agent read and decided" onClick={() => openAudit(name)}>
        {/* A page with a check: the run's record, read back. */}
        <path d="M4 1.5h5.5L12 4v10.5H4z" />
        <path d="m6 9 1.5 1.5L10 8" />
      </Control>
      <Control label="Docs — read the project's Markdown" onClick={() => openPalette("docs")}>
        <DocIcon />
      </Control>
      <Control label="What you added to this map — and a way back" onClick={openHistory}>
        {/* A clock turned back: the history of the reader's own additions. */}
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4.5V8l2.5 1.5" />
      </Control>
    </>
  );
}

function Control({
  label,
  onClick,
  danger,
  win,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** One of the window's own buttons: minimize, maximize, close. */
  win?: boolean;
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
        "flex cursor-pointer items-center justify-center text-muted-slate transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green",
        // Window buttons fill the bar's height, as native ones do; the tools
        // are small square targets, as in an editor's title bar.
        win ? "h-full w-11" : "mx-px h-7 w-7 rounded-[2px]",
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
