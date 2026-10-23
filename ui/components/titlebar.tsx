"use client";

import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState, useSyncExternalStore } from "react";
import { toggleTerminal } from "@/components/terminal";
import { openClaude } from "@/lib/context";
import { openSettings } from "@/lib/settings";
import { useMap } from "@/components/map-context";
import { cn } from "@/lib/utils";

/**
 * The window's own title bar. The native one is off (`decorations: false` in
 * tauri.conf.json), so this draws the name, the drag area and the window
 * buttons in the page's palette rather than the desktop's.
 *
 * Everything marked `data-tauri-drag-region` moves the window, and a double
 * click on it maximizes, as a native bar does. Buttons sit outside those
 * regions so a click on one is never read as the start of a drag. Outside the
 * desktop app (plain `next dev` in a browser) there is no window to drive, so
 * nothing is drawn.
 */

const noSubscribe = () => () => {};

export function Titlebar() {
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const { RUN } = useMap();
  const [maximized, setMaximized] = useState(false);

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
      className="flex h-9 shrink-0 select-none items-center border-b border-border-gray bg-surface-container-low pl-3.5"
    >
      <span data-tauri-drag-region className="font-mono text-[11.5px] font-semibold text-ink">
        understand-slop
      </span>
      <span data-tauri-drag-region className="ml-2 font-mono text-[11.5px] text-faint">
        {RUN.repo}
      </span>
      <div data-tauri-drag-region className="h-full flex-1" />
      <Control label="Claude Code — right-click a card to hand it over" onClick={openClaude}>
        <path d="M8 2.5v11M2.5 8h11M4.1 4.1l7.8 7.8m0-7.8-7.8 7.8" />
      </Control>
      <Control label="Toggle terminal (Ctrl+`)" onClick={toggleTerminal}>
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
