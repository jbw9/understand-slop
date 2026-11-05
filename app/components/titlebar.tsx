"use client";

import { isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { openSettings } from "@/lib/settings";
import { openPalette } from "@/components/palette";
import { useMap } from "@/components/map-context";
import { openFolder, openProjects } from "@/components/projects";
import { Menu } from "@/components/menu";
import { openAudit } from "@/components/audit";
import { openHistory } from "@/components/history";
import { openDiff, useDiff } from "@/components/diff";
import { openTimeline } from "@/components/timeline";
import { StatusDot, toggleWorkspace } from "@/components/workspace";
import { TabClose } from "@/components/tabs";
import { arrived, closeProject, keepOnly, useOpenProjects } from "@/lib/open-projects";
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
 * settings and the window buttons, so it can still be moved and closed. The
 * page itself offers Open Folder there, as VS Code's welcome does.
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
      data-chrome="bar"
      className="grid h-9 shrink-0 select-none grid-cols-[minmax(0,1fr)_max-content] items-center border-b border-border-gray bg-surface-container-low"
    >
      {/* The Mac's traffic lights take the left edge. */}
      <div data-tauri-drag-region className={cn("flex h-full min-w-0 items-center", mac ? "pl-[78px]" : "pl-1.5")}>
        {bare ? (
          <span data-tauri-drag-region className="px-2 font-mono text-[11.5px] font-semibold text-ink">
            Mira
          </span>
        ) : (
          <Where mac={mac} />
        )}
      </div>
      <div data-tauri-drag-region className="flex h-full items-center justify-end">
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

/**
 * The projects open in the window, a tab each, with the dot of the loudest
 * Claude among its workspace tabs (components/workspace.tsx); + opens another,
 * imports one, or manages them. Switching keeps every terminal running, and
 * the workspace shows the tabs of the project switched to. Cmd+1–9 (Ctrl+1–9
 * off a Mac) picks one, Ctrl+Tab the last. Where you are inside the map is
 * the map tabs' to say (components/tabs.tsx).
 */
function Where({ mac }: { mac: boolean }) {
  const { name, maps } = useMap();
  const router = useRouter();
  const { open, last, status } = useOpenProjects();
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const shown = open.flatMap((id) => maps.filter((m) => m.id === id));
  const go = useCallback((id: string | null | undefined) => id && id !== name && router.push(`/?map=${encodeURIComponent(id)}`), [name, router]);

  const was = useRef<string | null>(null);
  useEffect(() => {
    arrived(name, was.current);
    was.current = name;
  }, [name]);
  useEffect(() => keepOnly(maps.map((m) => m.id)), [maps]);

  // Off a Mac here; on one the menu bar takes the keys (src-tauri/src/lib.rs),
  // so they work from inside a Preview's page too.
  const ids = shown.map((m) => m.id).join("\n");
  useEffect(() => {
    const pick = (n: string) => go(n === "last" ? last : ids.split("\n")[Number(n) - 1]);
    const onKey = (e: KeyboardEvent) => {
      if (!e.ctrlKey || e.metaKey || e.altKey) return;
      const n = e.code === "Tab" && !e.shiftKey ? "last" : !e.shiftKey && /^Digit[1-9]$/.test(e.code) ? e.code.slice(5) : null;
      if (!n) return;
      e.preventDefault();
      e.stopPropagation();
      pick(n);
    };
    if (!mac) window.addEventListener("keydown", onKey, true);
    const fromMenu = mac ? listen<string>("slop:project", (e) => pick(e.payload)) : undefined;
    return () => {
      window.removeEventListener("keydown", onKey, true);
      void fromMenu?.then((f) => f());
    };
  }, [mac, go, last, ids]);

  const close = (id: string) => {
    if (id === name) {
      const at = shown.findIndex((m) => m.id === id);
      go((shown[at + 1] ?? shown[at - 1])?.id);
    }
    closeProject(id);
  };

  return (
    <>
      <div role="tablist" aria-label="Open projects" className="flex min-w-0 items-center gap-0.5">
        {shown.map((m, i) => {
          const here = m.id === name;
          const dot = m.root ? status[m.root] : undefined;
          return (
            // Outside the drag region, so a click switches rather than moving the window.
            <div
              key={m.id}
              role="tab"
              aria-selected={here}
              title={`${m.label}${i < 9 ? ` (${mac ? "⌘" : "Ctrl+"}${i + 1})` : ""}`}
              className={cn(
                "group flex h-6 min-w-0 max-w-48 items-center gap-1.5 pl-2 pr-1 font-mono text-[11.5px] transition-colors",
                here ? "bg-surface-container font-semibold text-ink" : "text-muted-slate hover:bg-surface-container hover:text-ink",
              )}
            >
              <button type="button" onClick={() => go(m.id)} className="flex min-w-0 cursor-pointer items-center gap-1.5 focus-visible:outline-2 focus-visible:outline-accent">
                <span className="truncate">{m.label}</span>
                {dot && <StatusDot status={dot} />}
              </button>
              {shown.length > 1 ? <TabClose label={m.label} active={here} onClose={() => close(m.id)} /> : <span className="w-1" />}
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4 });
        }}
        aria-haspopup="menu"
        title="Open another project"
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center justify-center text-faint transition-colors hover:bg-surface-container hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
      >
        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M5 1.5v7M1.5 5h7" />
        </svg>
      </button>
      {menu ? (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            ...maps.map((m) => ({
              label: m.label,
              icon: <span className="w-3 text-accent">{open.includes(m.id) ? "✓" : ""}</span>,
              onClick: () => go(m.id),
            })),
            { label: "Import project…", icon: <span className="w-3 text-muted-slate">+</span>, onClick: () => void openFolder(), separated: true },
            { label: "Manage projects…", icon: <span className="w-3" />, onClick: () => openProjects() },
          ]}
        />
      ) : null}
    </>
  );
}

/** The tools that act on the open map. */
function MapTools() {
  const { name } = useMap();
  const diff = useDiff();
  return (
    <>
      <Control
        label={diff?.diff || diff?.loading ? "Version control — showing changes on the map. Open the history" : "Version control — the commit history, and what each changed"}
        onClick={openDiff}
        active={Boolean(diff?.diff || diff?.loading)}
      >
        {/* Lucide's git-branch, the glyph editors give source control. */}
        <g transform="scale(0.6667)" strokeWidth="1.875">
          <path d="M6 3v12" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 0 1-9 9" />
        </g>
      </Control>
      <Control label="How the code got here — its commits over the map's sections" onClick={openTimeline}>
        {/* A line through time with three commits on it. */}
        <path d="M1.5 8h13" />
        <circle cx="4" cy="8" r="1.6" />
        <circle cx="8.5" cy="8" r="2.2" />
        <circle cx="12.5" cy="8" r="1.2" />
      </Control>
      <Control label="How sure is this map — what was checked, and what to double-check" onClick={() => openAudit(name)}>
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
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  /** On: the mode this button turns on is showing. */
  active?: boolean;
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
      aria-pressed={active}
      title={label}
      className={cn(
        "flex cursor-pointer items-center justify-center text-muted-slate transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
        // Window buttons fill the bar's height, as native ones do; the tools
        // are small square targets, as in an editor's title bar.
        win ? "h-full w-11" : "mx-px h-7 w-7",
        danger ? "hover:bg-clay-ink hover:text-paper" : "hover:bg-surface-container hover:text-ink",
        active && "bg-accent/15 text-accent hover:text-accent",
        className,
      )}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
