"use client";

import { useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { goTo } from "@/components/chrome";
import { useMap } from "@/components/map-context";
import { openFile, useOpenFile } from "@/components/code";
import { closeTab, follow, insertTab, openTab, readTabs, replaceTab, selectTab, useTabs, type Tab } from "@/lib/tabs";
import { Menu } from "@/components/menu";
import { cn } from "@/lib/utils";

/** What a tab holds, opened: its level, and its file over it. */
/** A tab's name: its file, else its level's title. The top level is "Bluprint": the project's own tab above already names the repository. */
export const tabTitle = (nodeAt: (path: string[]) => { title: string } | null | undefined, path: string[], file?: string) =>
  file ? file.split("/").pop()! : path.length ? (nodeAt(path)?.title ?? "Bluprint") : "Bluprint";

/** A floor plan: the Bluprint tab, the top of the map. Drawn like the workspace's tab glyphs. */
export function BlueprintIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mr-0.5 size-3 shrink-0">
      <rect x="2.5" y="2.5" width="11" height="11" rx="1" />
      <path d="M7.5 2.5v6h6" />
      <path d="M2.5 10.5h3" />
    </svg>
  );
}

export const show = (t: Tab) => (t.file ? openFile(t.path, t.file) : goTo(t.path));

/** Opens a level of the open map in a new tab, in front. */
export function openInTab(map: string, path: string[]) {
  openTab(map, path);
  goTo(path);
}

/**
 * Where a part dragged off the map (components/canvas.tsx) goes on a strip of
 * the map's tabs, as Chrome takes a dragged link: between two tabs, a new tab
 * there (`at`, with `x` the gap's place on the strip); over a tab's middle,
 * that tab. `strip` says which strip: the map's own, or the main view's
 * (components/workspace.tsx), drawn over it while a workspace tab is there.
 */
export type Drop = { strip: string } & ({ at: number; x: number } | { on: number });

/** Where on the strip in view a part let go at (x, y) lands, if on it at all. */
export function dropAt(x: number, y: number): Drop | null {
  const inside = (r: DOMRect) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  const strips = [...document.querySelectorAll<HTMLElement>("[data-section-tabs]")].filter(
    (el) => el.checkVisibility() && inside(el.getBoundingClientRect()),
  );
  const strip = strips.find((el) => el.dataset.sectionTabs === "main") ?? strips[0];
  if (!strip) return null;
  const which = strip.dataset.sectionTabs!;
  const s = strip.getBoundingClientRect();
  const tabs = [...strip.querySelectorAll<HTMLElement>('[role="tab"][data-tab-id]')];
  const gap = (left: number) => left - s.left + strip.scrollLeft;
  for (const [i, el] of tabs.entries()) {
    const r = el.getBoundingClientRect();
    if (x < r.left + r.width / 4) return { strip: which, at: i, x: gap(r.left - 1) };
    if (x <= r.right - r.width / 4) return { strip: which, on: Number(el.dataset.tabId) };
  }
  const last = tabs.at(-1)?.getBoundingClientRect();
  return { strip: which, at: tabs.length, x: gap(last ? last.right + 1 : s.left + 6) };
}

/** A part being dragged: its name, where the pointer is, and where it would land. */
export interface PartDrag {
  label: string;
  x: number;
  y: number;
  drop: Drop | null;
}

let dragged: PartDrag | null = null;
const watchers = new Set<() => void>();
const watch = (f: () => void) => {
  watchers.add(f);
  return () => void watchers.delete(f);
};

export function setPartDrag(next: PartDrag | null) {
  dragged = next;
  for (const f of watchers) f();
}

export const usePartDrag = () => useSyncExternalStore(watch, () => dragged, () => null);

/** Where a part dragged over `strip` would land there, if it is over it. */
export function useDropOn(strip: string) {
  const drop = usePartDrag()?.drop;
  return drop?.strip === strip ? drop : null;
}

/** A tab a dragged part would be let go into. */
export const DROP_TARGET = "border-accent bg-accent/25 text-ink hover:bg-accent/25";

/** The gap a dragged part would open a new tab in. */
export function DropMarker({ drop }: { drop: Drop | null }) {
  return drop && "at" in drop ? (
    <span
      aria-hidden
      style={{ left: drop.x }}
      className="pointer-events-none absolute bottom-0.5 top-[5px] w-[2px] -translate-x-1/2 rounded-full bg-accent"
    />
  ) : null;
}

/** A part let go on the strip: into a new tab between two, or into the tab it was dropped on. */
export function dropInTab(map: string, path: string[], drop: Drop) {
  if ("on" in drop) replaceTab(map, drop.on, path);
  else insertTab(map, path, drop.at);
  goTo(path);
}

/** What follows the pointer while a part is dragged: its name, and what letting go here does. */
export function DragChip() {
  const d = usePartDrag();
  if (!d) return null;
  const { label, x, y, drop } = d;
  return (
    <div
      aria-hidden
      style={{ left: x + 12, top: y + 10 }}
      className="pointer-events-none fixed z-50 flex max-w-[320px] items-center gap-1.5 border border-border-gray bg-card px-2.5 py-1 text-[12px] text-ink shadow-lift"
    >
      <span className="truncate">{label}</span>
      {drop ? <span className="shrink-0 text-faint">→ {"on" in drop ? "replace" : "new tab"}</span> : null}
    </div>
  );
}

/** A Preview tab asked for from the main view's `+`; the workspace (components/workspace.tsx) opens it. */
export const OPEN_PREVIEW = "slop:new-preview";

/** The main view's `+`: another tab of the map, or a Preview. */
export function NewTab({ onMap }: { onMap: () => void }) {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setMenu({ x: r.left, y: r.bottom + 4 });
        }}
        aria-label="New tab"
        aria-haspopup="menu"
        title="New tab"
        className="flex h-6 w-6 shrink-0 cursor-pointer items-center self-center justify-center text-faint transition-colors hover:bg-surface-container hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
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
            { label: "Bluprint", onClick: onMap },
            { label: "Preview", onClick: () => window.dispatchEvent(new Event(OPEN_PREVIEW)) },
          ]}
        />
      ) : null}
    </>
  );
}

/**
 * The landing page's demo repositories, when it frames this map
 * (landing/components/v2/landing-demo.tsx): it posts them in, and the strip
 * shows one tab per repository, as if each were open, instead of the map's
 * own. Picking one posts back, and the landing points the frame at it.
 */
type Demos = { repos: { id: string; label: string }[]; open: string };
let demos: Demos | null = null;
const demoWatchers = new Set<() => void>();
if (typeof window !== "undefined" && window.parent !== window) {
  window.addEventListener("message", (e) => {
    if (e.origin !== location.origin || e.data?.type !== "slop:repos") return;
    demos = { repos: e.data.repos, open: e.data.open };
    for (const f of demoWatchers) f();
  });
  // The landing's own post on load can come before this listens, so ask too.
  window.parent.postMessage({ type: "slop:ready" }, location.origin);
}
const watchDemos = (f: () => void) => {
  demoWatchers.add(f);
  return () => void demoWatchers.delete(f);
};
const useDemos = () => useSyncExternalStore(watchDemos, () => demos, () => null);

/**
 * The open map's tabs, across the top of the map: one per level the reader
 * has open, named by that level's title, and `+` for another at the top. A
 * part opens in a new tab with a middle click, ⌘/Ctrl-click, or "Open in new
 * tab" on its right-click menu (components/canvas.tsx). Ctrl+Tab and
 * Ctrl+Shift+Tab step through them; Ctrl+W (⌘W on a Mac) closes the one in front.
 */
export function SectionTabs({ path }: { path: string[] }) {
  const { name, nodeAt } = useMap();
  const state = useTabs(name);
  const file = useOpenFile()?.file;
  const key = `${path.join("/")}|${file ?? ""}`;
  // Only when the level or its file changes, not when a tab comes forward:
  // the tab brought forward already holds what is about to open.
  useEffect(() => {
    follow(name, path, file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, key]);
  const tabs = state?.tabs ?? [{ id: 0, path }];
  const active = state?.active ?? 0;
  const many = tabs.length > 1;
  const drop = useDropOn("map");
  const framed = useDemos();
  const titleOf = (t: Tab) => tabTitle(nodeAt, t.path, t.file);

  const select = (id: number) => {
    const p = selectTab(name, id);
    if (p) show(p);
  };
  const close = (id: number) => {
    const p = closeTab(name, id);
    if (p) show(p);
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
          if (p) show(p);
        }
        return;
      }
      const mod = /Mac|iPhone|iPad/.test(navigator.platform) ? e.metaKey : e.ctrlKey;
      if (e.code === "KeyW" && mod && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        const p = closeTab(name, t.active);
        if (p) show(p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [name]);

  if (framed)
    return (
      // On the landing page the strip is the sheet's, white with a line of its ink, not one of the app's black bars.
      <div role="tablist" data-chrome aria-label="Repository" className={cn(TAB_STRIP, "shadow-[inset_0_-1px_0_var(--color-ink)]")}>
        {framed.repos.map((r, i) => (
          <SectionTab
            key={r.id}
            id={i}
            label={r.label}
            home={false}
            active={r.id === framed.open}
            target={false}
            onSelect={() => window.parent.postMessage({ type: "slop:open", id: r.id }, location.origin)}
          />
        ))}
      </div>
    );

  return (
    <div
      role="tablist"
      data-chrome="bar"
      data-section-tabs="map"
      aria-label={`Open sections of ${name}`}
      className={cn(TAB_STRIP, "relative")}
    >
      {tabs.map((t) => (
        <SectionTab
          key={t.id}
          id={t.id}
          label={titleOf(t)}
          home={!t.path.length && !t.file}
          active={t.id === active}
          target={drop !== null && "on" in drop && drop.on === t.id}
          onSelect={() => select(t.id)}
          onClose={many ? () => close(t.id) : undefined}
        />
      ))}
      <NewTab onMap={() => openInTab(name, [])} />
      <DropMarker drop={drop} />
    </div>
  );
}

/** One tab: a click brings it to the front, × or a middle click closes it. */
function SectionTab({
  id,
  label,
  home,
  active,
  target,
  onSelect,
  onClose,
}: {
  id: number;
  label: string;
  /** The top of the map, marked with a floor plan. */
  home: boolean;
  active: boolean;
  /** A part is dragged over it, to be let go into it. */
  target: boolean;
  onSelect: () => void;
  onClose?: () => void;
}) {
  return (
    <div
      role="tab"
      data-tab-id={id}
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
      className={cn(
        tabLook(active, !!onClose),
        !active && "cursor-pointer",
        target && DROP_TARGET,
      )}
    >
      {home ? <BlueprintIcon /> : null}
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
    "group flex h-[29px] min-w-0 max-w-[200px] shrink-0 items-center gap-1 border border-b-0 pl-2.5 text-[12px] transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
    closable ? "pr-1" : "pr-2.5",
    active
      ? "border-border-gray bg-paper font-semibold text-ink"
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
        "flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center text-faint hover:bg-border-gray hover:text-ink",
        active ? "" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
      )}
    >
      <svg aria-hidden width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
        <path d="m1.5 1.5 5 5m0-5-5 5" />
      </svg>
    </button>
  );
}
