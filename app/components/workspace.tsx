"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { motion } from "motion/react";
import { AgentIcon, CLAUDE, TerminalIcon, agentById, useAgents, type Agent } from "@/components/agents";
import { useMap } from "@/components/map-context";
import { Menu } from "@/components/menu";
import { Shell } from "@/components/shell";
import { announceAnswer, announceDraft } from "@/components/keep";
import { announceAct, type Act } from "@/lib/act";
import { clearPicks, onHand, onOpenClaude, prompt, retarget, section, tabEnded, tabStarted, unpick, usePicks } from "@/lib/context";
import { useLocation } from "@/components/chrome";
import { openSettings, readSettings } from "@/lib/settings";
import type { Exchange } from "@/lib/keep";
import { cn } from "@/lib/utils";

/**
 * The workspace: one window, floating over the map's right edge, with a row
 * of tabs. Every tab is a terminal — the user's shell on a pty in the open
 * map's checkout (components/shell.tsx) — opened straight into a coding agent
 * (components/agents.tsx) or as a plain shell, from the `+` menu. Quitting the
 * agent leaves the shell, in the same folder, and the strip under the terminal
 * starts one again. A tab's label says what is in front: Claude, another
 * agent, or the shell.
 *
 * Map context goes to a tab running Claude (lib/context.ts): the strip shows
 * what is waiting for its next prompt and what has gone.
 *
 * It floats rather than docks, so opening it never takes height or width from
 * the map, and its width gives way to the window's. Hiding it, or switching
 * tabs, never ends a program; a tab ends when it is closed or its shell exits.
 * Tabs belong to the project they were opened in.
 */

const TOGGLE = "slop:workspace";
export const toggleWorkspace = () => window.dispatchEvent(new Event(TOGGLE));

const WIDTH_KEY = "slop.workspace.width";
const MIN_WIDTH = 380;
/** The gap kept around the window. */
const GAP = 12;
/** The custom title bar's height, in the desktop app. */
const TITLEBAR = 36;
/** The status bar's height (components/statusbar.tsx), which it floats above. */
const STATUSBAR = 24;

interface Tab {
  key: number;
  /** The agent it opened into, or null for a plain shell. */
  start: string | null;
  /** The agent last started in it, from the menu or the strip: what a busy shell is running. */
  ran: string | null;
  /** The shell's own name, `zsh` for `/usr/bin/zsh`. */
  title: string;
  /** The checkout it was opened in: which project's tab it is. */
  cwd: string;
  /** The pty behind it, once started. */
  pty?: number;
  /** Claude is running in it, through the app's launcher. */
  live: boolean;
  /** Some other program is in front of the shell. */
  busy: boolean;
  /** Whether Claude Code was found for it; unknown while it starts. */
  found?: boolean;
}

function storedWidth() {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    if (w >= MIN_WIDTH) return w;
  } catch {
    /* storage blocked: the default is fine */
  }
  return 640;
}

/** Tab keys, unique for the app's life. */
let nextKey = 1;

const noSubscribe = () => () => {};

export function Workspace() {
  const map = useMap();
  const here = map.RUN.root ?? "";
  // The section in front (components/tabs.tsx), which every prompt to Claude
  // here is told about without being shown (src-tauri/src/claude.rs, place).
  const { path, crumbs } = useLocation();
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  // Hidden once it has slid away, so it takes no clicks and no focus.
  const [settled, setSettled] = useState(true);
  const [open, setOpen] = useState(false);
  // Safe to read during render: nothing is drawn until a tab is opened.
  const [width, setWidth] = useState(storedWidth);
  const [tabs, setTabs] = useState<Tab[]>([]);
  // The tab last in view, per project.
  const [active, setActive] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const mine = tabs.filter((t) => t.cwd === here);
  const current = mine.find((t) => t.key === active[here]) ?? mine.at(-1);
  const { agents, others, main: mainAgent } = useAgents();
  const main = mainAgent.id;
  const aside = useRef<HTMLElement>(null);
  // Text waiting to be pasted into a new tab's agent once it is up, by tab;
  // sent, not only pasted, when it carries a question.
  const [toPaste, setToPaste] = useState<Record<number, { text: string; send: boolean }>>({});

  const patch = (key: number, next: Partial<Tab>) =>
    setTabs((all) => all.map((x) => (x.key === key ? { ...x, ...next } : x)));

  const show = useCallback((next: boolean) => {
    setOpen(next);
    setSettled(false);
  }, []);

  const add = useCallback(
    (start: string | null) => {
      const key = nextKey++;
      setTabs((t) => [...t, { key, start, ran: start, title: "terminal", cwd: here, live: false, busy: false }]);
      setActive((a) => ({ ...a, [here]: key }));
      show(true);
      return key;
    },
    [here, show],
  );

  const select = useCallback((key: number) => setActive((a) => ({ ...a, [here]: key })), [here]);

  // What is in front in each tab: Claude (the launcher keeps a marker), some
  // other program, or the shell at its prompt. Polled, since programs start
  // and quit inside the shell, unseen.
  // A turn of Claude's that edited the checkout, or found the map wrong,
  // updates that project's map. Separately, EVERY finished turn is offered to
  // the map as an answer worth keeping (components/keep.tsx) — a turn that only
  // explained something edits nothing, so `turn` never fires for the very case
  // a reader most wants to keep.
  const started = JSON.stringify(tabs.filter((t) => t.pty !== undefined).map((t) => [t.key, t.pty, t.cwd]));
  useEffect(() => {
    const ids: [number, number, string][] = JSON.parse(started);
    if (!ids.length) return;
    const tick = () =>
      ids.forEach(([key, pty, cwd]) =>
        invoke<{ claude: boolean; busy: boolean; turn: Turn | null; ended: string | null; acts: Act[] }>("pty_state", { id: pty })
          .then(({ claude: live, busy, turn, ended, acts }) => {
            if (turn && cwd) void updateMap(cwd, turn);
            if (ended) void offerAnswer(ended);
            // Mid-turn, deliberately: Claude shows a section while it is still
            // explaining it (lib/act.ts).
            acts?.forEach(announceAct);
            // Same array when nothing moved: a new one every tick would reset
            // the paste effect's timer below before it could ever fire.
            setTabs((all) =>
              all.some((x) => x.key === key && (x.live !== live || x.busy !== busy))
                ? all.map((x) => (x.key === key ? { ...x, live, busy } : x))
                : all,
            );
          })
          .catch(() => {}),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [started]);

  // A new tab's agent is up once something is in front of its shell; give it
  // a moment to draw its prompt, then paste what was handed to it.
  useEffect(() => {
    const ready = tabs.filter((t) => t.busy && t.pty !== undefined && toPaste[t.key] !== undefined);
    if (!ready.length) return;
    const timer = setTimeout(() => {
      for (const t of ready) (toPaste[t.key].send ? prompt : paste)(t.pty!, toPaste[t.key].text);
      setToPaste((all) => {
        const rest = { ...all };
        for (const t of ready) delete rest[t.key];
        return rest;
      });
    }, 1500);
    return () => clearTimeout(timer);
  }, [tabs, toPaste]);

  // Where the reader is, kept beside every tab of this project, so whatever
  // runs Claude there can say "you are reading X" without a pick in the strip.
  const reading = `[Reading now: ${[map.RUN.repo, ...crumbs.map((c) => c.title)].join(" › ")}]\n${section(map, path).text}`;
  const terminals = JSON.stringify(tabs.filter((t) => t.cwd === here && t.pty !== undefined).map((t) => t.pty));
  useEffect(() => {
    for (const id of JSON.parse(terminals) as number[]) void invoke("context_where", { id, text: reading }).catch(() => {});
  }, [terminals, reading]);

  // Picks go to the tab in view if Claude runs there, else this project's
  // newest tab running it; with none, a pick opens a tab (lib/context.ts).
  const claudeHere =
    (current?.live ? current.pty : undefined) ?? mine.findLast((t) => t.live && t.pty !== undefined)?.pty ?? null;
  useEffect(() => retarget(claudeHere), [claudeHere]);

  const close = useCallback(
    (key: number) => {
      const gone = tabs.find((x) => x.key === key);
      if (!gone) return;
      const rest = tabs.filter((x) => x.key !== key);
      setTabs(rest);
      if (gone.pty !== undefined) tabEnded(gone.pty);
      // The neighbour in the same project takes over; its last one closing
      // hides the window.
      const group = tabs.filter((x) => x.cwd === gone.cwd);
      const left = rest.filter((x) => x.cwd === gone.cwd);
      const i = group.findIndex((x) => x.key === key);
      if (active[gone.cwd] === key) {
        setActive((a) => ({ ...a, [gone.cwd]: left[Math.min(i, left.length - 1)]?.key ?? -1 }));
      }
      if (!left.length && gone.cwd === here) show(false);
    },
    [tabs, active, here, show],
  );

  useEffect(() => {
    const toggle = () => (open && mine.length ? show(false) : mine.length ? show(true) : add(main));
    // Asked for from the map: a tab running Claude, shown; or a new one.
    const toClaude = () => {
      const last = (current?.live ? current : undefined) ?? mine.findLast((t) => t.live);
      if (!last) return add(CLAUDE.id);
      select(last.key);
      show(true);
    };
    // Capture phase, so the shortcut wins before xterm's own textarea sees
    // the key and sends it to the program.
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+Shift+T: a new tab running the default agent.
      if (e.code === "KeyT" && e.shiftKey && (e.ctrlKey || e.metaKey) && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        add(main);
        return;
      }
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      // Ctrl+T: a new terminal tab.
      if (e.code === "KeyT" && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        add(null);
        return;
      }
      // Ctrl+W closes the tab in view, as in a browser — only from inside the
      // window, so the map never loses a tab to a stray key.
      if (e.code === "KeyW" && !e.shiftKey) {
        if (!current || !aside.current?.contains(e.target as globalThis.Node)) return;
        e.preventDefault();
        e.stopPropagation();
        close(current.key);
        return;
      }
      if (e.code !== "Backquote" || e.shiftKey) return;
      e.preventDefault();
      e.stopPropagation();
      toggle();
    };
    // Handed to an agent other than Claude: pasted into a tab running it,
    // or into a new one once it is up; with a question, sent as a prompt.
    const toAgent = (agent: string, t: { text: string }, question?: string) => {
      const text = question ? `${t.text}\n\n${question}` : t.text;
      const running = mine.find((x) => x.pty !== undefined && inFront(x)?.id === agent);
      if (running) {
        (question ? prompt : paste)(running.pty!, text);
        select(running.key);
        show(true);
        return;
      }
      const key = add(agent);
      setToPaste((all) => ({ ...all, [key]: { text, send: !!question } }));
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(TOGGLE, toggle);
    const off = onOpenClaude(toClaude);
    const offHand = onHand(toAgent);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOGGLE, toggle);
      off();
      offHand();
    };
  }, [open, mine, current, main, add, close, select, show]);

  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    const from = e.clientX;
    // What is on screen, which a narrow window may have clamped.
    const start = (e.currentTarget.parentElement as HTMLElement).offsetWidth;
    let last = start;
    const move = (m: PointerEvent) => {
      last = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 2 * GAP, start + from - m.clientX));
      setWidth(last);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      try {
        localStorage.setItem(WIDTH_KEY, String(last));
      } catch {
        /* not kept; it still applies until reload */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  if (!tabs.length) return null;
  const shown = open && mine.length > 0;
  return (
    <motion.aside
      ref={aside}
      aria-label="Workspace"
      aria-hidden={!shown}
      initial={{ x: "110%" }}
      animate={{ x: shown ? 0 : "110%" }}
      transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
      onAnimationComplete={() => setSettled(true)}
      style={{
        top: (desktop ? TITLEBAR : 0) + GAP,
        bottom: STATUSBAR + GAP,
        right: GAP,
        // Never wider than the window allows, whatever was dragged out before.
        width: `min(${width}px, calc(100vw - ${2 * GAP}px))`,
        visibility: !shown && settled ? "hidden" : "visible",
      }}
      className="fixed z-40 flex flex-col overflow-hidden rounded-[10px] border border-border-gray bg-surface-container-low shadow-[0_8px_28px_-8px_rgba(26,26,46,0.14)]"
    >
      <div
        onPointerDown={drag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        className="absolute inset-y-6 left-0 z-10 w-1.5 cursor-col-resize hover:bg-deep-green/20"
      />
      {/* Tabs as an editor draws them: the open one is the colour of the
          pane below it and has no line under it, so it reads as the front of
          the terminal rather than a pill above it. */}
      <header className="flex h-9 shrink-0 items-stretch bg-surface-container" role="tablist">
        <div className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
          {mine.map((t, i) => {
            const front = inFront(t);
            return (
              <div
                key={t.key}
                role="tab"
                aria-selected={t.key === current?.key}
                className={cn(
                  "group flex shrink-0 items-center gap-2 border-r border-border-gray pl-3 pr-2 text-[12px]",
                  t.key === current?.key
                    ? "bg-surface-container-low text-ink"
                    : "border-b text-muted-slate hover:text-ink",
                )}
              >
                <button type="button" onClick={() => select(t.key)} className="flex cursor-pointer items-center gap-1.5">
                  {front ? <AgentIcon id={front.id} /> : <TerminalIcon />}
                  {front ? front.command.replace(/^slop-/, "") : t.title} {i + 1}
                </button>
                <button
                  type="button"
                  onClick={() => close(t.key)}
                  aria-label={`Close tab ${i + 1}`}
                  className="flex size-[18px] cursor-pointer items-center justify-center rounded-[4px] text-faint opacity-0 hover:bg-surface-container hover:text-ink group-hover:opacity-100 group-aria-selected:opacity-100"
                >
                  ×
                </button>
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
          aria-label="New tab"
          aria-haspopup="menu"
          title="New tab (Ctrl+T for a terminal, Ctrl+Shift+T for the default agent)"
          className="flex w-9 shrink-0 cursor-pointer items-center justify-center border-b border-border-gray text-[15px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
        >
          +
        </button>
        <div className="flex-1 border-b border-border-gray" />
        <button
          type="button"
          onClick={() => show(false)}
          aria-label="Hide workspace"
          title="Hide (Ctrl+`) — everything keeps running. Ctrl+W closes a tab."
          className="flex w-9 shrink-0 cursor-pointer items-center justify-center border-b border-border-gray text-[12px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
        >
          ✕
        </button>
      </header>
      {menu ? (
        <Menu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={[
            // The default agent first, then the rest in their usual order.
            ...[...agents]
              .sort((a, b) => Number(b.id === main) - Number(a.id === main))
              .map((a) => ({ label: a.label, icon: <AgentIcon id={a.id} />, onClick: () => add(a.id) })),
            { label: "Terminal", icon: <TerminalIcon />, onClick: () => add(null) },
          ]}
        />
      ) : null}
      <div className="relative min-h-0 flex-1 pt-1.5">
        {tabs.map((t) => (
          <Shell
            key={t.key}
            startClaude={t.start === CLAUDE.id}
            run={t.start && t.start !== CLAUDE.id ? agentById(t.start)?.command : undefined}
            cwd={t.cwd || undefined}
            visible={shown && t.key === current?.key}
            onTitle={(title) => patch(t.key, { title })}
            onClaude={(found) => patch(t.key, { found })}
            onSpawn={(pty) => {
              patch(t.key, { pty });
              tabStarted(pty, t.start === CLAUDE.id);
            }}
            onExit={() => close(t.key)}
          />
        ))}
      </div>
      {/* Under the terminal, beside where a prompt is typed: Claude Code draws
          its input at the foot of the tab, so what the next prompt will carry
          sits next to it rather than across the top of the window. */}
      {current?.pty !== undefined ? (
        <Strip
          tab={current}
          pty={current.pty}
          agents={current.found === false ? others : agents}
          onRun={(id) => patch(current.key, { ran: id })}
        />
      ) : null}
    </motion.aside>
  );
}

/**
 * A turn of Claude's the map follows (src-tauri/src/claude.rs): its session's
 * transcript, for what it did and why, and the sections it reported wrong
 * with slop-map-fix.
 */
interface Turn {
  transcript: string | null;
  corrections: { section: string; note: string }[];
}

/**
 * Asks for the map of the project at `root` to be brought up to its code
 * (lib/vault.ts): only the sections the edits touched, or the agent found
 * wrong, are redone, by the same Claude Code the tabs run. Nothing happens
 * for a map that is not the user's own project.
 */
async function updateMap(root: string, turn: Turn) {
  const found = await invoke<{ path: string } | null>("claude_detect", { configured: readSettings().claudePath || null }).catch(() => null);
  const res = await fetch("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "update", root, claude: found?.path, turn }),
  })
    .then((r) => r.json())
    .catch(() => null);
  // Not one of the user's projects: the title bar says so, and offers to import it.
  if (res?.skipped) window.dispatchEvent(new CustomEvent(UNFOLLOWED, { detail: root }));
}

/**
 * Reads back what Claude just asked and answered, and offers it to the map.
 *
 * A draft the reader asked for (components/keep.tsx) comes back as an ordinary
 * answer, so it is announced on its own channel first: the dialog is waiting
 * for one and the level is not.
 */
async function offerAnswer(transcript: string) {
  const r = await fetch(`/api/answer?transcript=${encodeURIComponent(transcript)}`)
    .then((x) => x.json())
    .catch(() => null);
  const e = r?.exchange as Exchange | null | undefined;
  if (!e?.said) return;
  if (!announceDraft(e.said)) announceAnswer(e);
}

/** An agent edited a checkout whose map cannot follow it; the detail is the checkout. */
export const UNFOLLOWED = "slop:map-unfollowed";

/**
 * Puts text in a program's prompt as a paste, without pressing Enter: agents'
 * TUIs ask for bracketed paste, so it lands as one block they can tell from
 * typing.
 */
function paste(pty: number, text: string) {
  void invoke("pty_write", { id: pty, data: `\x1b[200~${text}\x1b[201~` });
}

/**
 * The agent in front in a tab, if any: Claude when its launcher says so,
 * else the agent last started there while the shell is busy with something.
 */
function inFront(t: Tab): Agent | undefined {
  if (t.live) return CLAUDE;
  if (t.busy && t.ran !== CLAUDE.id) return agentById(t.ran ?? undefined);
  return undefined;
}

/**
 * The line under the terminal. With Claude running: the map context handed to
 * it, waiting (◷) until the next prompt takes it, then sent (✓); only a
 * waiting one can still be taken back. With the shell at its prompt: the
 * agents to start here. With anything else in front, only waiting picks.
 */
function Strip({
  tab,
  pty,
  agents,
  onRun,
}: {
  tab: Tab;
  pty: number;
  agents: Agent[];
  onRun: (id: string) => void;
}) {
  const picks = usePicks(pty);
  const idle = !tab.live && !tab.busy;
  if (!tab.live && !idle && !picks.length) return null;
  const run = (a: Agent) => {
    onRun(a.id);
    void invoke("pty_write", { id: pty, data: `${a.command}\r` });
  };
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-torder-gray px-3 py-1.5 font-mono text-[11px] [scrollbar-width:none]">
      {tab.live ? <span className="shrink-0 text-faint">context</span> : null}
      {idle
        ? agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => run(a)}
              title={
                a.id === CLAUDE.id
                  ? "Runs slop-claude in this shell: your Claude Code, able to take map context"
                  : `Runs ${a.command} in this shell`
              }
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-[6px] border border-border-strong px-2 py-px text-ink hover:bg-surface-container"
            >
              <AgentIcon id={a.id} />
              {a.id === CLAUDE.id ? "Claude" : a.label}
            </button>
          ))
        : null}
      {idle && tab.found === false ? (
        <span className="shrink-0 text-faint">
          Claude Code was not found.{" "}
          <button type="button" onClick={openSettings} className="cursor-pointer text-deep-green underline">
            Open Settings
          </button>
        </span>
      ) : null}
      {picks.map((p) => (
        <span
          key={p.key}
          title={p.status === "queued" ? "Goes with the next prompt to Claude here" : "Sent to Claude"}
          className={cn(
            "flex shrink-0 items-center gap-1.5 rounded-[6px] border px-2 py-px",
            p.status === "queued" ? "border-deep-green/50 text-ink" : "border-border-gray text-faint",
          )}
        >
          <span aria-hidden className={p.status === "queued" ? "text-deep-green" : undefined}>
            {p.status === "queued" ? "◷" : "✓"}
          </span>
          {p.title}
          <button
            type="button"
            onClick={() => void unpick(pty, p.key)}
            aria-label={`Remove ${p.title}`}
            className="cursor-pointer text-faint hover:text-ink"
          >
            ×
          </button>
        </span>
      ))}
      {picks.length ? (
        <button
          type="button"
          onClick={() => void clearPicks(pty)}
          className="ml-1 shrink-0 cursor-pointer text-faint hover:text-ink"
        >
          clear
        </button>
      ) : tab.live ? (
        <span className="truncate text-faint/80">right-click a card on the map to add it</span>
      ) : null}
    </div>
  );
}
