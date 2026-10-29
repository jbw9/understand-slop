"use client";

import { useEffect, type ReactNode } from "react";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { closeTab, follow, openTab, readTabs, selectTab, useTabs } from "@/lib/tabs";
import { cn } from "@/lib/utils";

/** Opens a level of the open map in a new tab, in front. */
export function openInTab(map: string, path: string[]) {
  openTab(map, path);
  goTo(path);
}

/**
 * The open map's tabs, across the top of the map: one per level the reader
 * has open, named by that level's title, and `+` for another at the top. A
 * part opens in a new tab with a middle click, ⌘/Ctrl-click, or "Open in new
 * tab" on its right-click menu (components/canvas.tsx). Ctrl+Tab and
 * Ctrl+Shift+Tab step through them; Ctrl+W (⌘W on a Mac) closes the one in front.
 */
export function SectionTabs({ path }: { path: string[] }) {
  const { name, nodeAt, RUN } = useMap();
  const state = useTabs(name);
  const key = path.join("/");
  // Only when the level changes, not when a tab comes forward: the tab
  // brought forward already holds the level about to open.
  useEffect(() => {
    follow(name, path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key]);
  const tabs = state?.tabs ?? [{ id: 0, path }];
  const active = state?.active ?? 0;
  const many = tabs.length > 1;
  const titleOf = (p: string[]) => (p.length ? (nodeAt(p)?.title ?? RUN.repo) : RUN.repo);

  const select = (id: number) => {
    const p = selectTab(name, id);
    if (p) goTo(p);
  };
  const close = (id: number) => {
    const p = closeTab(name, id);
    if (p) goTo(p);
  };

  // Read fresh on each key rather than closed over, so a held Ctrl+Tab steps
  // from the tab it just reached.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Inside the workspace these keys are its own tabs' (components/workspace.tsx).
      if ((e.target as Element | null)?.closest?.('[aria-label="Workspace"]')) return;
      const t = readTabs(name);
      if (!t) return;
      const at = t.tabs.findIndex((x) => x.id === t.active);
      if (e.code === "Tab" && e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        const step = e.shiftKey ? -1 : 1;
        const next = t.tabs[(at + step + t.tabs.length) % t.tabs.length];
        if (next.id !== t.active) {
          const p = selectTab(name, next.id);
          if (p) goTo(p);
        }
        return;
      }
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      if (e.code === "KeyW" && mod && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const p = closeTab(name, t.active);
        if (p) goTo(p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [name]);

  return (
    <div
      role="tablist"
      data-chrome
      aria-label={`Open sections of ${name}`}
      className={TAB_STRIP}
    >
      {tabs.map((t) => (
        <SectionTab
          key={t.id}
          label={titleOf(t.path)}
          active={t.id === active}
          onSelect={() => select(t.id)}
          onClose={many ? () => close(t.id) : undefined}
        />
      ))}
      <button
        type="button"
        onClick={() => openInTab(name, [])}
        aria-label="New tab"
        title="New tab"
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center self-center justify-center rounded-[2px] text-faint transition-colors hover:bg-surface-container hover:text-ink focus-visible:outline-2 focus-visible:outline-deep-green"
      >
        <svg aria-hidden width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
          <path d="M5 1.5v7M1.5 5h7" />
        </svg>
      </button>
    </div>
  );
}

/** One tab: a click brings it to the front, × or a middle click closes it. */
function SectionTab({
  label,
  active,
  onSelect,
  onClose,
}: {
  label: string;
  active: boolean;
  onSelect: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      role="tab"
      aria-selected={active}
      tabIndex={0}
      title={label}
      onClick={active ? undefined : onSelect}
      onKeyDown={(e) => {
        if (!active && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onSelect();
        }
      }}
      onAuxClick={(e) => {
        if (e.button === 1 && onClose) {
          e.preventDefault();
          onClose();
        }
      }}
      className={cn(tabLook(active, !!onClose), !active && "cursor-pointer")}
    >
      <TabLabel>{label}</TabLabel>
      {onClose ? <TabClose label={label} active={active} onClose={onClose} /> : null}
    </div>
  );
}

/*
 * The look of a strip of tabs over the main view, shared with the main view's
 * strip when a workspace tab is dragged into it (components/workspace.tsx),
 * so the map's tabs read the same with or without one there.
 */

/** The strip. Its bottom line is an inset shadow rather than a border, so the
 * tab in front can paint over it and run on into what is below. */
export const TAB_STRIP =
  "flex h-8 shrink-0 items-end gap-0.5 overflow-x-auto bg-surface-container-low px-1.5 shadow-[inset_0_-1px_0_var(--color-border-gray)]";

/** A tab. The one in front is the map's own ground, open at the bottom, so it
 * reads as the top of the page beneath rather than a button on the strip. */
export function tabLook(active: boolean, closable: boolean) {
  return cn(
    "group flex h-[29px] min-w-0 max-w-[200px] shrink-0 items-center gap-1 rounded-t-[4px] border border-b-0 pl-2.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-deep-green",
    closable ? "pr-1" : "pr-2.5",
    active
      ? "border-border-gray bg-warm-cream font-semibold text-ink"
      : "border-transparent text-muted-slate hover:bg-surface-container hover:text-ink",
  );
}

/** A tab's name. A hidden bold copy holds every tab at the width it has in
 * front, so bringing one forward doesn't shift the others along. */
export function TabLabel({ children }: { children: ReactNode }) {
  return (
    <span className="grid min-w-0">
      <span className="truncate [grid-area:1/1]">{children}</span>
      <span aria-hidden className="invisible truncate font-semibold [grid-area:1/1]">
        {children}
      </span>
    </span>
  );
}

/** A tab's ×, shown on the tab in front and on hover. */
export function TabClose({ label, active, onClose }: { label: string; active: boolean; onClose: () => void }) {
  return (
    <button
      type="button"
      data-close
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      aria-label={`Close ${label}`}
      className={cn(
        "flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-[2px] text-faint hover:bg-border-gray hover:text-ink",
        active ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
      )}
    >
      <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="m1.5 1.5 5 5m0-5-5 5" />
      </svg>
    </button>
  );
}
