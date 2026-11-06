"use client";

import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { motion, useMotionValue } from "motion/react";
import { AgentIcon, CLAUDE, TerminalIcon, agentById, useAgents, type Agent } from "@/components/agents";
import { keys, useMac } from "@/components/button";
import { useMap } from "@/components/map-context";
import { Menu } from "@/components/menu";
import { Shell } from "@/components/shell";
import { Preview } from "@/components/preview";
import { PlanView, type Plan } from "@/components/plan";
import { FileTab } from "@/components/file-tab";
import { Device, PLATFORM, type Platform } from "@/components/device";
import { announceAnswer, announceDraft } from "@/components/keep";
import { announceAct, type Act } from "@/lib/act";
import { onHand, onOpenClaude, prompt, retarget, section, tabEnded, tabStarted, tabStatus } from "@/lib/context";
import { useLocation } from "@/components/chrome";
import { DROP_TARGET, DropMarker, BlueprintIcon, NewTab, OPEN_PREVIEW, TAB_STRIP, TabClose, TabLabel, openInTab, show as showTab, tabLook, tabTitle, useDropOn } from "@/components/tabs";
import { closeTab, selectTab, useTabs } from "@/lib/tabs";
import { findAddress, findQuestion, findTaken, hostOf, previewOf, type Call } from "@/lib/preview";
import { openSettings, readSettings } from "@/lib/settings";
import { updateMap, type Turn } from "@/lib/update-map";
import type { Exchange } from "@/lib/keep";
import { reportStatus, type Status } from "@/lib/open-projects";
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
 * It floats rather than docks, and its width gives way to the window's. The
 * map keeps clear of it, as a plan does: its level is laid out in what the
 * window leaves (--workspace-inset), so nothing is hidden under it. Hiding it, or switching
 * tabs, never ends a program; a tab ends when it is closed or its shell exits.
 * Tabs belong to the project they were opened in.
 *
 * Besides terminals, a tab can be the project running: a Preview of its web
 * app (components/preview.tsx), or its phone app on the Android emulator or
 * the iOS Simulator (components/device.tsx). When a project with a web dev
 * server opens, its server starts and the Preview opens, showing the page once
 * the server prints its address. The server's terminal has no tab of its own:
 * it is drawn in the Preview's, which switches between the page and it. A project
 * with a phone app is offered its simulator, once; nothing is installed for
 * one until the user asks. Claude reaches the preview through the app's MCP
 * server (src-tauri/src/mcp.rs), and this is where its calls find the right
 * project's preview.
 *
 * A plan Claude writes in plan mode opens in a tab of its own, as a short
 * design doc it can be accepted from (components/plan.tsx): in the main view
 * beside the window, where Claude is, so the two are read side by side.
 *
 * A tab can be dragged out of the window onto the map, into the main view:
 * there it takes the map's place, with a strip of its own whose first tab is
 * the map, and it is dragged back the same way. A tab is the same tab in
 * either place: it is moved, never started again.
 */

export const TOGGLE = "slop:workspace";
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
  /** A terminal, the project running (its web app, or a phone), a plan, or a file a terminal named. */
  kind: "shell" | "preview" | "plan" | "file" | Platform;
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
  /** A command the app typed into it when it opened: the dev server, a setup, a build. */
  run?: string;
  /** What it is called instead of its shell's name, when the app opened it for something. */
  label?: string;
  /** It runs the dev server: its output is watched for the server's address,
   * and it is drawn in the project's Preview tab rather than in a tab of its own. */
  dev?: boolean;
  /** The dev server's: the folder of the web app it serves. */
  site?: string;
  /** Moved out of the window, into the main view in front of the map. */
  main?: boolean;
  /** What the agent in front is doing, for the dot on the tab. */
  status?: Status;
  /** A plan's tab: the plan, and the tab of the Claude that wrote it. */
  plan?: Plan;
  of?: number;
  /** A file's tab: its absolute path, and the line it was opened at. */
  file?: string;
  line?: number;
  /** The conversation Claude is having in it, to reopen it into after a restart. */
  session?: string;
  /** Reopened after a restart: the conversation its Claude picks up again. */
  resume?: string;
}

/** How a project is run, from its files (src-tauri/src/devices.rs). */
interface Project {
  /** Its web apps, the one to open first leading: the folder each is in, and how it starts. */
  web: { dir: string; run: string }[];
  android: boolean;
  ios: boolean;
}

const OFFER_KEY = "slop.offer:";
/** The web app a project's Preview was last switched to, by its folder. */
const SITE_KEY = "slop.site:";

function storedSite(root: string): string | null {
  try {
    return localStorage.getItem(SITE_KEY + root);
  } catch {
    return null;
  }
}
/** The conversations Claude was having in the tabs, per project, so the app reopens them. */
const SESSIONS_KEY = "slop.workspace.sessions";

function storedSessions(): { cwd: string; session: string }[] {
  try {
    return JSON.parse(localStorage.getItem(SESSIONS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function offered(root: string) {
  try {
    return localStorage.getItem(OFFER_KEY + root) !== null;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Polls for something to exist, giving up after `ms`. */
async function until<T>(get: () => T | undefined, ms: number): Promise<T> {
  for (let waited = 0; waited < ms; waited += 100) {
    const v = get();
    if (v) return v;
    await sleep(100);
  }
  throw new Error("The preview did not open in time.");
}

function storedWidth() {
  try {
    const w = Number(localStorage.getItem(WIDTH_KEY));
    if (w >= MIN_WIDTH) return w;
  } catch {
    /* storage blocked: the default is fine */
  }
  // Wide enough for a full Claude Code status line, about 105 columns.
  return 900;
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
  const mapState = useTabs(map.name);
  const mapTabs = mapState?.tabs ?? [{ id: 0, path }];
  const mapActive = mapState?.active ?? 0;
  // A part dragged off the map onto this strip (components/canvas.tsx).
  const drop = useDropOn("main");
  const titleOf = (p: string[], file?: string) => tabTitle(map.nodeAt, p, file);
  const desktop = useSyncExternalStore(noSubscribe, isTauri, () => false);
  const onMac = useMac();
  // Hidden once it has slid away, so it takes no clicks and no focus.
  const [settled, setSettled] = useState(true);
  const [open, setOpen] = useState(false);
  // Safe to read during render: nothing is drawn until a tab is opened.
  const [width, setWidth] = useState(storedWidth);
  const [tabs, setTabs] = useState<Tab[]>([]);
  // The tab last in view, per project.
  const [active, setActive] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // The tab in the main view, per project; none, or one moved away, is the map.
  const [front, setFront] = useState<Record<string, number | null>>({});
  const mine = tabs.filter((t) => t.cwd === here);
  const panel = mine.filter((t) => !t.main && !t.dev);
  const docked = mine.filter((t) => t.main && !t.dev);
  const current = panel.find((t) => t.key === active[here]) ?? panel.at(-1);
  const upFront = docked.find((t) => t.key === front[here]);
  // Where tab bodies are drawn: the window's and the main view's.
  const [panelSlot, setPanelSlot] = useState<HTMLElement | null>(null);
  const [mainSlot, setMainSlot] = useState<HTMLElement | null>(null);
  const mainPane = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState<{ key: number; x: number; y: number; to: "main" | "panel" } | null>(null);
  const { agents, others, main: mainAgent } = useAgents();
  const main = mainAgent.id;
  const aside = useRef<HTMLElement>(null);
  // Where the closed window's dots were dragged to, kept while it opens and closes.
  const dotsX = useMotionValue(0);
  const dotsY = useMotionValue(0);
  const dotsMoved = useRef(false);
  // Text waiting to be pasted into a new tab's agent once it is up, by tab;
  // sent, not only pasted, when it carries a question.
  const [toPaste, setToPaste] = useState<Record<number, { text: string; send: boolean }>>({});

  const patch = (key: number, next: Partial<Tab>) =>
    setTabs((all) => all.map((x) => (x.key === key ? { ...x, ...next } : x)));

  const show = useCallback((next: boolean) => setOpen(next), []);

  const add = useCallback(
    (start: string | null, extra?: Partial<Tab>) => {
      const key = nextKey++;
      const cwd = extra?.cwd ?? here;
      // A Preview opens in the main view, not beside Claude in the window.
      const main = extra?.main ?? extra?.kind === "preview";
      setTabs((t) => [...t, { key, kind: "shell", start, ran: start, title: "terminal", cwd, live: false, busy: false, main, ...extra }]);
      if (main) setFront((f) => ({ ...f, [cwd]: key }));
      // A dev server is drawn in its Preview, never in the window.
      else if (!extra?.dev) {
        setActive((a) => ({ ...a, [cwd]: key }));
        if (cwd === here) show(true);
      }
      return key;
    },
    [here, show],
  );

  // Before the restore below, so the empty first render never overwrites
  // what is about to be reopened.
  const restored = useRef(false);
  useEffect(() => {
    if (!restored.current) return;
    const open = tabs.flatMap((t) => (t.kind === "shell" && t.session ? [{ cwd: t.cwd, session: t.session }] : []));
    try {
      localStorage.setItem(SESSIONS_KEY, JSON.stringify(open));
    } catch {
      /* not kept: the tabs still work */
    }
  }, [tabs]);
  useEffect(() => {
    if (restored.current || !isTauri()) return;
    restored.current = true;
    // Once, from storage the server render cannot read: initial state would not hydrate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    for (const { cwd, session } of storedSessions()) add(CLAUDE.id, { cwd, session, resume: session });
  }, [add]);

  // Each project's dev server address, once it has printed one; and how each
  // project is run, read when it is first opened.
  const [servers, setServers] = useState<Record<string, string>>({});
  // The projects whose Preview shows the dev server's terminal, not the page.
  const [serverShown, setServerShown] = useState<Record<number, boolean>>({});
  // A yes-or-no question each project's dev server is waiting on, asked in its Preview.
  const [asking, setAsking] = useState<Record<string, string | undefined>>({});
  const [projects, setProjects] = useState<Record<string, Project>>({});
  const [offers, setOffers] = useState<Record<string, boolean>>({});
  const tabsNow = useRef(tabs);
  const projectsNow = useRef(projects);
  const serversNow = useRef(servers);
  useEffect(() => {
    projectsNow.current = projects;
    serversNow.current = servers;
    tabsNow.current = tabs;
    // Past every tab open: a hot reload starts the counter again, but not the tabs.
    for (const t of tabs) if (t.key >= nextKey) nextKey = t.key + 1;
  });

  // The Preview last in view, per project: the one an agent is first given, and the one
  // brought back when a project's Preview is asked for.
  const lastPreview = useRef<Record<string, number>>({});
  // The Previews each agent has used, by its tab's pty, the latest last; let
  // go of once that tab is closed.
  const claims = useRef<Record<number, number[]>>({});
  useEffect(() => {
    for (const t of [current, upFront]) if (t?.kind === "preview") lastPreview.current[t.cwd] = t.key;
  });
  const previewTab = (root: string) => {
    const all = tabsNow.current.filter((x) => x.kind === "preview" && x.cwd === root);
    return all.find((x) => x.key === lastPreview.current[root]) ?? all.at(-1);
  };

  /**
   * A project's dev server, started when it has a web app and none runs: the
   * one asked for, else the one last switched to, else the one it opens first.
   * Not over an address something else pointed the Preview at.
   */
  const startDev = useCallback(
    (root: string, dir?: string, force?: boolean) => {
      const sites = projectsNow.current[root]?.web ?? [];
      if (!sites.length) return;
      // Forced, by the user's own pick: whatever runs is being replaced.
      if (!force && (!readSettings().devServer || serversNow.current[root] || tabsNow.current.some((x) => x.dev && x.cwd === root))) return;
      const want = dir ?? storedSite(root);
      const site = sites.find((x) => x.dir === want) ?? sites[0];
      add(null, { run: site.run, dev: true, site: site.dir, label: "dev server", cwd: root });
    },
    [add],
  );

  /** A project's Preview tab, the one last in view or the one keyed: brought to the front, or opened. */
  const preview = useCallback(
    (root: string, key?: number) => {
      const open = key === undefined ? previewTab(root) : tabsNow.current.find((x) => x.key === key);
      if (!open) {
        // Closing the last Preview stopped the dev server; a new one starts it again.
        startDev(root);
        return add(null, { kind: "preview", title: "Preview", cwd: root });
      }
      setServerShown((s) => ({ ...s, [open.key]: false }));
      if (open.main) setFront((f) => ({ ...f, [root]: open.key }));
      else {
        setActive((a) => ({ ...a, [root]: open.key }));
        if (root === here) show(true);
      }
      return open.key;
    },
    [add, here, show, startDev],
  );
  useEffect(() => {
    const open = () => {
      // The dev server stops with a project's last Preview, so a new one starts it again.
      startDev(here);
      add(null, { kind: "preview", title: "Preview", cwd: here });
    };
    window.addEventListener(OPEN_PREVIEW, open);
    return () => window.removeEventListener(OPEN_PREVIEW, open);
  }, [add, here, startDev]);

  /** This project's phone of a kind: brought to the front, or opened. */
  const phone = (platform: Platform) => {
    const open = mine.find((x) => x.kind === platform);
    if (!open) return add(null, { kind: platform, title: PLATFORM[platform].label });
    if (open.main) return setFront((f) => ({ ...f, [here]: open.key }));
    setActive((a) => ({ ...a, [here]: open.key }));
    show(true);
  };
  const touching = useRef(phone);
  useEffect(() => {
    touching.current = phone;
  });

  // A project opening for the first time this session: how it runs is read,
  // its dev server started with a Preview in front, and a phone app offered
  // its simulator.
  const launched = useRef(new Set<string>());
  useEffect(() => {
    if (!desktop || !here || launched.current.has(here)) return;
    launched.current.add(here);
    const root = here;
    invoke<Project>("project_detect", { root })
      .then((p) => {
        projectsNow.current = { ...projectsNow.current, [root]: p };
        setProjects((all) => ({ ...all, [root]: p }));
        if (p.web.length && readSettings().devServer) {
          startDev(root);
          if (!tabsNow.current.some((x) => x.kind === "preview" && x.cwd === root)) add(null, { kind: "preview", title: "Preview", cwd: root });
        }
      })
      .catch(() => {});
  }, [desktop, here, add, startDev]);

  // The dev server's tab, read as it prints until it gives its address. Only
  // whole lines, so an address split across two reads is never taken short.
  const tails = useRef<Record<number, string>>({});
  const borrowed = useRef(new Set<number>());
  // Agents other than Claude have no hooks to say what they are doing, so it
  // is read off the terminal: printing is working, quiet is done, and a bell
  // asks for the user. Echoes of the user's own typing are not the agent's.
  const printed = useRef<Record<number, number>>({});
  const typed = useRef<Record<number, number>>({});
  const rang = useRef<Record<number, boolean>>({});
  const printing = useCallback((key: number, text: string) => {
    if (Date.now() - (typed.current[key] ?? 0) < 500) return;
    printed.current[key] = Date.now();
    // The bell that ends a title escape (ESC ] … BEL) is not a ring.
    if (text.replace(/\x1b\][^\x07\x1b]*(\x07|\x1b\\)/g, "").includes("\x07")) rang.current[key] = true;
  }, []);
  const heard = (t: Tab, text: string) => {
    if (tails.current[t.key] === null) return;
    const tail = ((tails.current[t.key] ?? "") + text).slice(-4000);
    const q = findQuestion(tail) ?? undefined;
    setAsking((all) => (all[t.cwd] === q ? all : { ...all, [t.cwd]: q }));
    const whole = tail.slice(0, tail.lastIndexOf("\n") + 1);
    // Its port already served, as by the same app started elsewhere: that one
    // is shown, and this tab kept past its exit so its error can be read.
    const taken = findAddress(whole) ? null : findTaken(whole);
    if (taken) borrowed.current.add(t.key);
    const url = taken ?? findAddress(whole);
    if (!url) {
      tails.current[t.key] = tail;
      return;
    }
    (tails.current as Record<number, string | null>)[t.key] = null;
    setServers((all) => ({ ...all, [t.cwd]: url }));
    preview(t.cwd);
  };

  // Claude's calls on the preview (src-tauri/src/mcp.rs): the project is the
  // one of the tab Claude runs in. A screenshot needs the preview on screen,
  // and so does a click or a key, to be real input (components/preview.tsx).
  const latest = useRef({ here, shown: false });
  const answer = async ({ id, tab, cmd }: { id: number; tab: number; cmd: Call }) => {
    // Id 0 is the app's own call (a `web` act), which nobody waits on.
    const reply = (ok: boolean, value: unknown) => id && void invoke("preview_reply", { id, ok, value });
    try {
      const root = tabsNow.current.find((x) => x.pty === tab)?.cwd ?? latest.current.here;
      // The map of the tab's own project, read on the server: no preview is involved.
      if (cmd.op === "map") {
        const a = cmd.args;
        const q = new URLSearchParams({ root, tool: cmd.name.replace(/^map_/, "") });
        if (a.query !== undefined) q.set("q", String(a.query));
        if (a.name !== undefined) q.set("name", String(a.name));
        if (a.file !== undefined) q.set("file", String(a.file));
        if (a.line !== undefined) q.set("line", String(a.line));
        const r = (await fetch(`/api/lookup?${q}`).then((x) => x.json())) as { text: string };
        return reply(true, r.text);
      }
      if (cmd.op === "terminal") return reply(true, terminal(root, tab, cmd.args));
      const previews = () => tabsNow.current.filter((x) => x.kind === "preview" && x.cwd === root);
      const n = cmd.tab ?? undefined;
      if (n !== undefined && !previews()[n - 1]) {
        const open = previews().length;
        throw new Error(`There is no Preview ${n}: this project has ${open || "no"} Preview tab${open === 1 ? "" : "s"} open. Navigate with new_tab to open another.`);
      }
      // Each agent drives Previews of its own, so two sessions in a project
      // never move each other's page: its last one, else one nobody has.
      const own = () => (claims.current[tab] ?? []).filter((k) => previews().some((x) => x.key === k));
      const taken = (k: number) =>
        Object.entries(claims.current).some(([p, ks]) => +p !== tab && ks.includes(k) && tabsNow.current.some((x) => x.pty === +p));
      const free = [previewTab(root), ...previews()].find((x) => x && !taken(x.key));
      let key = n !== undefined ? previews()[n - 1].key : (own().at(-1) ?? free?.key);
      // A new tab beside a Preview already open, or the agent's own when all are
      // others'; with none, the first one opens below as before.
      if (previews().length && ((cmd.op === "navigate" && cmd.newTab) || key === undefined)) {
        // In front only where the user is already with this agent or a Preview,
        // never over a tab they are typing in.
        const forward = root === here && (current?.pty === tab || upFront?.pty === tab || upFront?.kind === "preview");
        const before = front[root] ?? null;
        const made = add(null, { kind: "preview", title: "Preview", cwd: root });
        if (!forward) setFront((f) => ({ ...f, [root]: before }));
        await until(() => previewOf(made), 8000);
        key = made;
      }
      const claim = () => {
        if (key !== undefined && !taken(key)) claims.current[tab] = [...own().filter((k) => k !== key), key];
      };
      const which = () => {
        const all = previews();
        return all.length > 1 ? ` (in Preview ${all.findIndex((x) => x.key === key) + 1})` : "";
      };
      let handle = previewOf(key);
      if (!handle) {
        const asked = cmd.op === "navigate" && hostOf(cmd.url) ? (/^https?:/.test(cmd.url) ? cmd.url : `http://${cmd.url}`) : undefined;
        // Anything else to navigate to is a page from the web, which needs no server.
        const web = cmd.op === "sign_in" || (cmd.op === "navigate" && !asked && !cmd.url.trim().startsWith("/"));
        if (!asked && !web && !servers[root] && !projects[root]?.web.length)
          throw new Error(
            "No preview is open for this project, and no dev server has printed an address. Start the dev server in a terminal tab, or navigate to its address, like http://localhost:3000.",
          );
        if (asked) setServers((all) => ({ ...all, [root]: asked }));
        preview(root);
        handle = await until(() => previewOf(previewTab(root)?.key), 8000);
        key = previewTab(root)?.key;
        claim();
        if (asked) return reply(true, `Opened ${asked} in the preview${which()}.`);
      }
      claim();
      const seen = cmd.op === "frame" || cmd.op === "sign_in" || (cmd.op === "agent" && cmd.name === "computer");
      if (seen && root === latest.current.here) {
        const hidden = !latest.current.shown;
        preview(root, key);
        await sleep(hidden ? 520 : 80);
        // A window behind others draws no frames, so the slide in never runs:
        // it is put where it would have ended.
        if (document.visibilityState === "hidden" && aside.current) aside.current.style.transform = "none";
      } else if (cmd.op === "frame") {
        throw new Error("That preview belongs to a project that is not open in the window, so it cannot be seen.");
      }
      const out = await handle.run(cmd);
      // Named, so the agent can say `tab` from here on.
      if (cmd.op === "frame" && out && typeof out === "object") return reply(true, { ...out, url: `${(out as { url: string }).url}${which()}` });
      reply(true, typeof out === "string" ? out + which() : out);
    } catch (e) {
      reply(false, e instanceof Error ? e.message : String(e));
    }
  };
  /** A terminal's output, for an agent in tab `asker`: named, or the dev server's;
   * with the project's terminals listed, so it can ask for another. */
  const terminal = (root: string, asker: number, { name, lines = 200 }: { name?: string; lines?: number }) => {
    const all = tabsNow.current.filter((x) => x.cwd === root && x.kind === "shell" && x.pty !== undefined);
    const called = (x: Tab) => (x.dev ? "dev server" : nameOf(x));
    const listed = all.map((x) => `${called(x)}${x.pty === asker ? " (you)" : ""}`).join(", ");
    const want = name?.trim().toLowerCase();
    const t = want ? all.find((x) => called(x).toLowerCase() === want) : all.find((x) => x.dev);
    if (!t) throw new Error(`${want ? `No terminal called "${name}".` : "No dev server is running for this project."} Terminals: ${listed || "none"}.`);
    const out = (screens.current[t.key]?.(true) ?? []).join("\n").trimEnd().split("\n").slice(-Math.max(1, lines));
    return `Terminals: ${listed}.\n--- ${called(t)}, last ${out.length} lines ---\n${out.join("\n")}`;
  };

  // The latest of everything above, for a call that arrives between renders.
  const answering = useRef(answer);
  useEffect(() => {
    answering.current = answer;
    latest.current = { here, shown: open && panel.length > 0 };
  });
  useEffect(() => {
    if (!desktop) return;
    const off = listen<{ id: number; tab: number; cmd: Call }>("slop:preview", (e) => void answering.current(e.payload));
    // Claude touching a phone brings its tab forward, as acting on a page brings the Preview.
    const touched = listen<{ platform: Platform }>("slop:device-touch", (e) => {
      const { here } = latest.current;
      if (tabsNow.current.some((t) => t.kind === e.payload.platform && t.cwd === here)) touching.current(e.payload.platform);
    });
    return () => {
      void off.then((f) => f());
      void touched.then((f) => f());
    };
  }, [desktop]);

  const select = useCallback(
    (key: number) => {
      if (tabsNow.current.find((x) => x.key === key)?.main) setFront((f) => ({ ...f, [here]: key }));
      else setActive((a) => ({ ...a, [here]: key }));
    },
    [here],
  );
  /** A tab in view, wherever it is: the window is opened for one of its own. */
  const bring = useCallback(
    (key: number) => {
      select(key);
      if (!tabsNow.current.find((x) => x.key === key)?.main) show(true);
    },
    [select, show],
  );

  // A plan whose tab was closed, by the Claude that wrote it: its line in
  // that terminal (components/shell.tsx) opens it again.
  const closedPlans = useRef<Record<number, Plan>>({});
  // Each terminal's screen, for a plan's tab to read Claude Code's question off.
  const screens = useRef<Record<number, (all?: boolean) => string[]>>({});

  // A plan opens beside the Claude that wrote it: in the main view while
  // Claude is in the window, in the window while Claude is in the main view.
  // A revised plan takes the last one's place, in the same tab.
  const showPlan = (from: number, cwd: string, got: { text: string; file: string | null }) => {
    const had = tabsNow.current.find((x) => x.kind === "plan" && x.of === from);
    const last = had?.plan ?? closedPlans.current[from];
    const asked = last?.state === "revising" ? last.asked : undefined;
    placePlan(from, cwd, { ...got, version: (last?.version ?? 0) + 1, state: "open", after: asked });
  };
  /** The plan's tab, in front: made again if it was closed. */
  const placePlan = (from: number, cwd: string, plan: Plan) => {
    const had = tabsNow.current.find((x) => x.kind === "plan" && x.of === from);
    delete closedPlans.current[from];
    const main = had ? !!had.main : !tabsNow.current.find((x) => x.key === from)?.main;
    const key = had?.key ?? nextKey++;
    if (had) patch(key, { plan });
    else setTabs((t) => [...t, { key, kind: "plan", start: null, ran: null, title: "Plan", cwd, live: false, busy: false, plan, of: from, main }]);
    if (main) setFront((f) => ({ ...f, [cwd]: key }));
    else {
      setActive((a) => ({ ...a, [cwd]: key }));
      if (cwd === latest.current.here) show(true);
    }
  };
  /** A plan's tab closing keeps its plan; its Claude's closing lets it go. */
  const forgetPlan = (gone: Tab) => {
    if (gone.kind === "plan" && gone.of !== undefined && gone.plan) closedPlans.current[gone.of] = gone.plan;
    delete closedPlans.current[gone.key];
  };
  const reopenPlan = (from: number, cwd: string) => {
    const open = tabsNow.current.find((x) => x.kind === "plan" && x.of === from);
    if (open) return bring(open.key);
    const plan = closedPlans.current[from];
    if (plan) placePlan(from, cwd, plan);
  };
  /** A file a terminal named, in an editor tab in the main view: the one already open, or a new one. */
  const openFile = (cwd: string, file: string, line?: number) => {
    const open = tabsNow.current.find((x) => x.kind === "file" && x.cwd === cwd && x.file === file);
    if (!open) return add(null, { kind: "file", title: file.slice(file.lastIndexOf("/") + 1), cwd, file, line, main: true });
    patch(open.key, { line });
    bring(open.key);
  };
  const planning = useRef(showPlan);
  useEffect(() => {
    planning.current = showPlan;
  });

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
        invoke<{
          claude: boolean;
          busy: boolean;
          status: Status | null;
          turn: Turn | null;
          ended: string | null;
          acts: Act[];
          plan: { text: string; file: string | null } | null;
          approved: boolean;
          steps: NonNullable<Plan["steps"]>;
          session: string | null;
        }>("pty_state", { id: pty })
          .then(({ claude: live, busy, status: said, turn, ended, acts, plan, approved, steps = [], session }) => {
            if (turn && cwd) void followTurn(cwd, turn);
            if (plan) planning.current(key, cwd, plan);
            if (approved) {
              const shut = closedPlans.current[key];
              if (shut) closedPlans.current[key] = { ...shut, state: "approved", approvedAt: Date.now() };
              setTabs((all) => all.map((x) => (x.of === key && x.plan ? { ...x, plan: { ...x.plan, state: "approved", approvedAt: Date.now() } } : x)));
            }
            // Claude marking a step means the plan was accepted, however it was
            // answered: "Yes, clear context" never reports it (claude.rs, CLEARED).
            const marks = JSON.stringify(steps);
            setTabs((all) =>
              all.some((x) => x.of === key && x.plan && JSON.stringify(x.plan.steps ?? []) !== marks)
                ? all.map((x) =>
                    x.of === key && x.plan
                      ? { ...x, plan: { ...x.plan, steps, ...(steps.length && x.plan.state !== "approved" ? { state: "approved" as const, approvedAt: Date.now() } : {}) } }
                      : x,
                  )
                : all,
            );
            if (ended) void offerAnswer(ended);
            // Mid-turn, deliberately: Claude shows a section while it is still
            // explaining it (lib/act.ts).
            acts?.forEach(announceAct);
            // Same array when nothing moved: a new one every tick would reset
            // the paste effect's timer below before it could ever fire.
            const statusOf = (x: Tab): Status | undefined =>
              live
                ? (said ?? undefined)
                : inFront({ ...x, live, busy })
                  ? rang.current[key]
                    ? "waiting"
                    : Date.now() - (printed.current[key] ?? 0) < 3000
                      ? "working"
                      : "done"
                  : undefined;
            setTabs((all) =>
              all.some((x) => x.key === key && (x.live !== live || x.busy !== busy || x.status !== statusOf(x) || x.session !== (session ?? undefined)))
                ? all.map((x) => (x.key === key ? { ...x, live, busy, status: statusOf(x), session: session ?? undefined } : x))
                : all,
            );
          })
          .catch(() => {}),
      );
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [started]);

  // A review waits for Claude to be idle before it is typed (lib/context.ts sendBatch).
  useEffect(() => {
    for (const t of tabs) if (t.pty !== undefined) tabStatus(t.pty, t.live ? t.status : undefined);
    reportStatus(tabs);
  }, [tabs]);

  // The Dock icon's badge (src-tauri/src/lib.rs attention_count).
  const attention = tabs.filter((t) => t.live && (t.status === "done" || t.status === "waiting")).length;
  useEffect(() => {
    if (desktop) void invoke("attention_count", { n: attention }).catch(() => {});
  }, [desktop, attention]);

  // A chime when an agent finishes or needs the user, heard wherever they are
  // looking: the dot alone is easy to miss with the workspace closed.
  const was = useRef<Record<number, Status | undefined>>({});
  useEffect(() => {
    // WebKit lets a page sound only once the user has pressed something in it.
    const unlock = () => void (audio ??= new AudioContext()).resume();
    window.addEventListener("pointerdown", unlock, { once: true, capture: true });
    window.addEventListener("keydown", unlock, { once: true, capture: true });
    return () => {
      window.removeEventListener("pointerdown", unlock, { capture: true });
      window.removeEventListener("keydown", unlock, { capture: true });
    };
  }, []);
  useEffect(() => {
    for (const t of tabs) {
      const before = was.current[t.key];
      if (t.status !== before && ((t.status === "done" && before === "working") || t.status === "waiting")) chime(t.status);
      was.current[t.key] = t.status;
    }
  }, [tabs]);

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
    (current?.live ? current.pty : undefined) ??
    (upFront?.live ? upFront.pty : undefined) ??
    mine.findLast((t) => t.live && t.pty !== undefined)?.pty ??
    null;
  useEffect(() => retarget(claudeHere), [claudeHere]);

  const close = useCallback(
    (key: number) => {
      const gone = tabs.find((x) => x.key === key);
      if (!gone) return;
      // The dev server goes with its project's last Preview.
      const last = gone.kind === "preview" && !tabs.some((x) => x !== gone && x.kind === "preview" && x.cwd === gone.cwd);
      const dev = last ? tabs.find((x) => x.dev && x.cwd === gone.cwd) : undefined;
      const rest = tabs.filter((x) => x.key !== key && x !== dev);
      setTabs(rest);
      // A stopped dev server's address answers no more: kept, a Preview opened
      // later would wait on it with no terminal to show why.
      const stopped = gone.dev ? gone : dev;
      if (stopped) {
        delete tails.current[stopped.key];
        borrowed.current.delete(stopped.key);
        setServers((all) => {
          const rest = { ...all };
          delete rest[stopped.cwd];
          return rest;
        });
        setAsking((all) => ({ ...all, [stopped.cwd]: undefined }));
      }
      forgetPlan(gone);
      if (gone.pty !== undefined) tabEnded(gone.pty);
      if (dev?.pty !== undefined) tabEnded(dev.pty);
      // The neighbour in the same place takes over: in the window, whose last
      // one closing hides it; in the main view, where none left is the map.
      const near = (x: Tab) => x.cwd === gone.cwd && !x.main === !gone.main && !x.dev;
      const group = tabs.filter(near);
      const left = rest.filter(near);
      const i = group.findIndex((x) => x.key === key);
      const next = left[Math.min(i, left.length - 1)]?.key;
      if (gone.main) {
        if (front[gone.cwd] === key) setFront((f) => ({ ...f, [gone.cwd]: next ?? null }));
      } else {
        if (active[gone.cwd] === key) setActive((a) => ({ ...a, [gone.cwd]: next ?? -1 }));
        if (!left.length && gone.cwd === here) show(false);
      }
    },
    [tabs, active, front, here, show],
  );

  /** The project's Preview switched to another of its web apps: its server stopped, the other's started. */
  const switchSite = (root: string, dir: string) => {
    try {
      localStorage.setItem(SITE_KEY + root, dir);
    } catch {
      /* this session only */
    }
    const dev = tabs.find((x) => x.dev && x.cwd === root);
    if (dev?.site === dir) return;
    if (dev) close(dev.key);
    startDev(root, dir, true);
  };

  useEffect(() => {
    // Opening an empty panel starts the default agent; a plain terminal is one menu pick or Ctrl+T away.
    const toggle = () => (open && panel.length ? show(false) : panel.length ? show(true) : add(main));
    // Asked for from the map: a tab running Claude, shown; or a new one.
    const toClaude = () => {
      const last = (current?.live ? current : undefined) ?? (upFront?.live ? upFront : undefined) ?? mine.findLast((t) => t.live);
      if (!last) return add(CLAUDE.id);
      bring(last.key);
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
      // Cmd+` as well as Ctrl+`, as on a Mac.
      if (e.code === "Backquote" && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        toggle();
        return;
      }
      // On a Mac Cmd+T and Cmd+W, as in Terminal.app: Ctrl+T and Ctrl+W are
      // Claude Code's task list and a shell's delete-word there.
      const mac = /Mac|iPhone|iPad/.test(navigator.platform);
      if (mac && e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey && (e.code === "KeyT" || e.code === "KeyW")) {
        const into = e.target as globalThis.Node;
        const tab = aside.current?.contains(into) ? current : mainPane.current?.contains(into) ? upFront : undefined;
        // Cmd+T anywhere; Cmd+W only from inside the window, leaving the map's own tabs theirs.
        if (e.code === "KeyW" && !tab) return;
        e.preventDefault();
        e.stopPropagation();
        if (tab && e.code === "KeyW") close(tab.key);
        else add(null);
        return;
      }
      // The next or previous tab of the strip the key was pressed in: Ctrl+Tab
      // as in a browser, Cmd+Shift+] and [ as in a Mac's tabbed apps. Outside
      // the window and the main view's tabs, the map's own tabs take it (components/tabs.tsx).
      const by =
        e.code === "Tab" && e.ctrlKey && !e.metaKey && !e.altKey
          ? e.shiftKey ? -1 : 1
          : mac && e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && (e.code === "BracketRight" || e.code === "BracketLeft")
            ? e.code === "BracketRight" ? 1 : -1
            : 0;
      if (by) {
        const into = e.target as globalThis.Node;
        // With nothing focused, the main view, which is what is in view.
        const where = aside.current?.contains(into) ? "window" : mainPane.current?.contains(into) || into === document.body ? "main" : null;
        if (!where) return;
        e.preventDefault();
        e.stopPropagation();
        step(where, by);
        return;
      }
      if (!e.ctrlKey || e.altKey || e.metaKey) return;
      // Ctrl+T: a new terminal tab.
      if (e.code === "KeyT" && !e.shiftKey && !mac) {
        e.preventDefault();
        e.stopPropagation();
        add(null);
        return;
      }
      // Ctrl+W closes the tab in view, as in a browser — only from inside the
      // window, so the map never loses a tab to a stray key.
      if (e.code === "KeyW" && !e.shiftKey && !mac) {
        const into = e.target as globalThis.Node;
        const tab = aside.current?.contains(into) ? current : mainPane.current?.contains(into) ? upFront : undefined;
        if (!tab) return;
        e.preventDefault();
        e.stopPropagation();
        close(tab.key);
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
        bring(running.key);
        return;
      }
      const key = add(agent);
      setToPaste((all) => ({ ...all, [key]: { text, send: !!question } }));
    };
    /** One tab along in the window's strip or the main view's (the map's tabs, then the docked ones), wrapping. */
    const step = (where: "window" | "main", by: number) => {
      const maps = mapState?.tabs ?? [{ id: 0 }];
      const list: (number | { map: number })[] = where === "window" ? panel.map((t) => t.key) : [...maps.map((m) => ({ map: m.id })), ...docked.map((t) => t.key)];
      const now = where === "window" ? current?.key : (upFront?.key ?? maps.findIndex((m) => m.id === mapActive));
      const at = where === "main" && !upFront ? (now as number) : list.indexOf(now as number);
      const next = list[(at + by + list.length) % list.length];
      if (typeof next === "number") bring(next);
      else if (next) {
        setFront((f) => ({ ...f, [here]: null }));
        const p = selectTab(map.name, next.map);
        if (p) showTab(p);
      }
    };
    // On a Mac the menu bar takes these keys before the page sees them
    // (src-tauri/src/lib.rs). With focus in the page, the key goes back to
    // what has it, so the strip it is in steps, the map's own included; with
    // focus in a Preview's page, that Preview's strip steps.
    const fromStep = desktop
      ? listen<number>("slop:tab-step", (e) => {
          if (document.hasFocus()) {
            const key = { code: "Tab", key: "Tab", ctrlKey: true, shiftKey: e.payload < 0, bubbles: true, cancelable: true };
            (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", key));
          } else step(open && panel.length && current?.kind === "preview" ? "window" : upFront?.kind === "preview" ? "main" : "window", e.payload);
        })
      : undefined;
    // Ctrl+Enter from the menu bar, to the terminal with focus (components/shell.tsx).
    const fromSend = desktop
      ? listen("slop:send-now", () => {
          const key = { code: "Enter", key: "Enter", ctrlKey: true, bubbles: true, cancelable: true };
          (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", key));
        })
      : undefined;
    // Cmd+W from the menu bar, the same way.
    const fromClose = desktop
      ? listen("slop:tab-close", () => {
          if (document.hasFocus()) {
            const key = { code: "KeyW", key: "w", metaKey: true, bubbles: true, cancelable: true };
            (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", key));
          } else {
            const tab = open && panel.length && current?.kind === "preview" ? current : upFront?.kind === "preview" ? upFront : undefined;
            if (tab) close(tab.key);
          }
        })
      : undefined;
    window.addEventListener("keydown", onKey, true);
    window.addEventListener(TOGGLE, toggle);
    // The menu bar's Cmd+`/Ctrl+`, for when focus is in a Preview's page (src-tauri/src/lib.rs).
    const fromMenu = desktop ? listen("slop:toggle-workspace", toggle) : undefined;
    const off = onOpenClaude(toClaude);
    const offHand = onHand(toAgent);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener(TOGGLE, toggle);
      void fromMenu?.then((f) => f());
      void fromStep?.then((f) => f());
      void fromClose?.then((f) => f());
      void fromSend?.then((f) => f());
      off();
      offHand();
    };
  }, [open, mine, panel, docked, current, upFront, main, add, close, bring, show, desktop, mapState, mapActive, here, map.name]);

  const drag = (e: React.PointerEvent) => {
    e.preventDefault();
    // A preview's frame would take the pointer's moves for its own page.
    document.body.dataset.dragging = "";
    const from = e.clientX;
    // What is on screen, which a narrow window may have clamped.
    const start = (e.currentTarget.parentElement as HTMLElement).offsetWidth;
    let last = start;
    const move = (m: PointerEvent) => {
      last = Math.max(MIN_WIDTH, Math.min(window.innerWidth - 2 * GAP, start + from - m.clientX));
      // Straight to the page while dragging: a render of every tab per move made the edge trail the pointer.
      if (aside.current) aside.current.style.width = `min(${last}px, calc(100vw - ${2 * GAP}px))`;
      document.documentElement.style.setProperty("--workspace-inset", `calc(min(${last}px, 100vw - ${2 * GAP}px) + ${2 * GAP}px)`);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      delete document.body.dataset.dragging;
      setWidth(last);
      try {
        localStorage.setItem(WIDTH_KEY, String(last));
      } catch {
        /* not kept; it still applies until reload */
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  const shown = open && panel.length > 0;
  // Any change of shown, not only show(): closing the last tab slides the window away too.
  const [wasShown, setWasShown] = useState(shown);
  if (wasShown !== shown) {
    setWasShown(shown);
    setSettled(false);
  }
  // What the window covers of the main view's right, gap included. The plan
  // keeps clear of it, and so does the map (components/canvas.tsx), which is
  // not drawn here and reads it as --workspace-inset.
  // Kept until the window has slid away, so the map widens once, after, not under it.
  const inset = shown || !settled ? `calc(min(${width}px, 100vw - ${2 * GAP}px) + ${2 * GAP}px)` : undefined;
  useEffect(() => {
    const root = document.documentElement.style;
    if (inset) root.setProperty("--workspace-inset", inset);
    else root.removeProperty("--workspace-inset");
    return () => void root.removeProperty("--workspace-inset");
  }, [inset]);

  /** Where the window is, or would be: dropped there, a tab goes back into it. */
  const panelLeft = () => window.innerWidth - GAP - Math.min(width, window.innerWidth - 2 * GAP);

  // A tab dragged from either strip: onto the window's side it goes there,
  // anywhere else into the main view. A press that hardly moves is a click,
  // so the button's own click only selects from the keyboard.
  const grab = (t: Tab) => (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-close]")) return;
    const handle = e.currentTarget;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let to: "main" | "panel" | null = null;
    const move = (m: PointerEvent) => {
      if (to === null && Math.hypot(m.clientX - x0, m.clientY - y0) < 6) return;
      if (to === null) {
        handle.setPointerCapture(e.pointerId);
        // A preview's frame would take the pointer's moves for its own page.
        document.body.dataset.dragging = "";
      }
      to = m.clientX >= panelLeft() ? "panel" : "main";
      setDragging({ key: t.key, x: m.clientX, y: m.clientY, to });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      // Hardly moved: a click, which selects the tab.
      if (to === null) return select(t.key);
      delete document.body.dataset.dragging;
      setDragging(null);
      const main = to === "main";
      if (main !== !!t.main) patch(t.key, { main });
      if (main) setFront((f) => ({ ...f, [t.cwd]: t.key }));
      else {
        setActive((a) => ({ ...a, [t.cwd]: t.key }));
        show(true);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const nameOf = (t: Tab) => {
    // Numbered among the terminals alone, so a Preview or a plan before it never shifts it.
    const i = mine.filter((x) => x.kind === "shell" && !x.dev).indexOf(t);
    const front = inFront(t);
    const previews = mine.filter((x) => x.kind === "preview");
    return t.kind === "preview"
      ? previews.length > 1
        ? `Preview ${previews.indexOf(t) + 1}`
        : "Preview"
      : t.kind === "plan"
        ? (t.plan?.text.match(/^#\s+(.+)$/m)?.[1].trim() ?? "Plan")
        : t.kind === "file"
        ? t.title
        : t.kind !== "shell"
        ? PLATFORM[t.kind].label
        : front
          ? `${front.command.replace(/^slop-/, "")} ${i + 1}`
          : (t.label ?? `${t.title} ${i + 1}`);
  };
  const iconOf = (t: Tab) => {
    const front = inFront(t);
    return t.kind === "preview" ? (
      <GlobeIcon />
    ) : t.kind === "plan" ? (
      <PlanIcon />
    ) : t.kind === "file" ? (
      <FileIcon />
    ) : t.kind !== "shell" ? (
      <PhoneIcon />
    ) : front ? (
      <AgentIcon id={front.id} />
    ) : (
      <TerminalIcon />
    );
  };

  /** A tab in either strip, drawn as an editor draws one. */
  // A tab in the window is drawn as an editor draws one; in the main view, as
  // the map's own tabs are (components/tabs.tsx).
  const tabView = (t: Tab, selected: boolean, inMain = false) =>
    inMain ? (
      <div
        key={t.key}
        role="tab"
        aria-selected={selected}
        onPointerDown={grab(t)}
        title="Drag onto the window to put it back"
        className={cn(tabLook(selected, true), "cursor-default", dragging?.key === t.key && "opacity-40")}
      >
        <button type="button" onClick={(c) => c.detail === 0 && select(t.key)} className="flex min-w-0 cursor-pointer items-center gap-1.5">
          {iconOf(t)}
          <TabLabel>{nameOf(t)}</TabLabel>
          {t.status && <StatusDot status={t.status} />}
        </button>
        <TabClose label={nameOf(t)} active={selected} onClose={() => close(t.key)} />
      </div>
    ) : (
    <div
      key={t.key}
      role="tab"
      aria-selected={selected}
      onPointerDown={grab(t)}
      title="Drag onto the map to open it in the main view, or back onto the window"
      className={cn(
        "group flex shrink-0 cursor-default items-center gap-2 border-r border-border-gray pl-3 pr-2 text-[12px]",
        selected ? "bg-surface-container-low text-ink" : "border-b text-muted-slate hover:text-ink",
        dragging?.key === t.key && "opacity-40",
      )}
    >
      <button type="button" onClick={(c) => c.detail === 0 && select(t.key)} className="flex cursor-pointer items-center gap-1.5">
        {iconOf(t)}
        {nameOf(t)}
        {t.status && <StatusDot status={t.status} />}
      </button>
      <button
        type="button"
        data-close
        onClick={() => close(t.key)}
        aria-label={`Close ${nameOf(t)}`}
        className="flex size-[18px] cursor-pointer items-center justify-center text-faint opacity-0 hover:bg-surface-container hover:text-ink group-hover:opacity-100 group-aria-selected:opacity-100"
      >
        ×
      </button>
    </div>
  );
  const project = projects[here];
  const phones = (["ios", "android"] as const).filter((p) => project?.[p]);
  const offer =
    phones.length && !offers[here] && !offered(here) && !mine.some((t) => t.kind === "ios" || t.kind === "android") ? (
      <Offer
        phones={phones}
        onPick={(p) => {
          phone(p);
          setOffers((all) => ({ ...all, [here]: true }));
        }}
        onDismiss={() => {
          try {
            localStorage.setItem(OFFER_KEY + here, "1");
          } catch {
            /* asked again next time */
          }
          setOffers((all) => ({ ...all, [here]: true }));
        }}
      />
    ) : null;
  if (!tabs.length) return offer;
  return (
    <>
    {offer}
    <motion.aside
      ref={aside}
      aria-label="Workspace"
      aria-hidden={!shown}
      initial={{ x: "110%" }}
      animate={{ x: shown ? 0 : "110%" }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      onAnimationComplete={() => setSettled(true)}
      style={{
        top: (desktop ? TITLEBAR : 0) + GAP,
        bottom: STATUSBAR + GAP,
        right: GAP,
        // Never wider than the window allows, whatever was dragged out before.
        width: `min(${width}px, calc(100vw - ${2 * GAP}px))`,
        visibility: !shown && settled ? "hidden" : "visible",
      }}
      data-chrome
      className="fixed z-40 flex flex-col overflow-hidden border border-border-gray bg-surface-container-low shadow-[0_8px_28px_-8px_rgba(0,0,0,0.35)]"
    >
      <div
        onPointerDown={drag}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize workspace"
        className="absolute inset-y-6 left-0 z-10 w-1.5 cursor-col-resize hover:bg-accent/20"
      />
      {/* Tabs as an editor draws them: the open one is the colour of the
          pane below it and has no line under it, so it reads as the front of
          the terminal rather than a pill above it. */}
      <header data-chrome="bar" className="flex h-7 shrink-0 items-stretch bg-surface-container" role="tablist">
        <div className="flex min-w-0 items-stretch overflow-x-auto [scrollbar-width:none]">
          {panel.map((t) => tabView(t, t.key === current?.key))}
        </div>
        <button
          type="button"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setMenu({ x: r.left, y: r.bottom + 4 });
          }}
          aria-label="New tab"
          aria-haspopup="menu"
          title={`New tab (${keys(onMac, "T")} for a terminal, ${keys(onMac, "T", { shift: true })} for the default agent)`}
          className="flex w-7 shrink-0 cursor-pointer items-center justify-center border-b border-border-gray text-[15px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
        >
          +
        </button>
        <div className="flex-1 border-b border-border-gray" />
        <button
          type="button"
          onClick={() => show(false)}
          aria-label="Hide workspace"
          title={`Hide (${keys(onMac, "`")}) — everything keeps running. ${keys(onMac, "W")} closes a tab.`}
          className="flex w-7 shrink-0 cursor-pointer items-center justify-center border-b border-border-gray text-[12px] text-muted-slate hover:bg-surface-container-low hover:text-ink"
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
            // A terminal first, then the default agent and the rest in their usual order.
            { label: "Terminal", icon: <TerminalIcon />, onClick: () => add(null) },
            ...[...agents]
              .sort((a, b) => Number(b.id === main) - Number(a.id === main))
              .map((a) => ({ label: a.label, icon: <AgentIcon id={a.id} />, onClick: () => add(a.id) })),
            { label: "Preview", icon: <GlobeIcon />, onClick: () => add(null, { kind: "preview", title: "Preview", cwd: here }) },
            ...phones.map((p) => ({ label: PLATFORM[p].label === "iOS" ? "iOS Simulator" : "Android emulator", icon: <PhoneIcon />, onClick: () => phone(p) })),
          ]}
        />
      ) : null}
      <div ref={setPanelSlot} className="relative min-h-0 flex-1 pt-1.5" />
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
    <section
      ref={mainPane}
      aria-label="Main view"
      hidden={!docked.length}
      style={{ top: desktop ? TITLEBAR : 0, bottom: STATUSBAR }}
      className="pointer-events-none fixed inset-x-0 z-30 flex flex-col"
    >
      {/* The map's own tabs, as its strip draws them (components/tabs.tsx),
          then the tabs dragged here, drawn the same way: with a tab here the
          strip reads as it does without one, just longer. */}
      <header role="tablist" data-chrome="bar" data-section-tabs="main" className={cn(TAB_STRIP, "pointer-events-auto relative")}>
        {mapTabs.map((m) => {
          const label = titleOf(m.path, m.file);
          const selected = !upFront && m.id === mapActive;
          const closable = mapTabs.length > 1;
          const toMap = () => {
            setFront((f) => ({ ...f, [here]: null }));
            const p = selectTab(map.name, m.id);
            if (p) showTab(p);
          };
          const closeMap = () => {
            const p = closeTab(map.name, m.id);
            if (p) showTab(p);
          };
          return (
            <div
              key={`map-${m.id}`}
              role="tab"
              data-tab-id={m.id}
              aria-selected={selected}
              tabIndex={0}
              title={label}
              onClick={selected ? undefined : toMap}
              onKeyDown={(e) => {
                if (!selected && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  toMap();
                }
              }}
              onAuxClick={(e) => {
                if (e.button === 1 && closable) {
                  e.preventDefault();
                  closeMap();
                }
              }}
              className={cn(tabLook(selected, closable), !selected && "cursor-pointer", drop !== null && "on" in drop && drop.on === m.id && DROP_TARGET)}
            >
              {!m.path.length && !m.file ? <BlueprintIcon /> : null}
              <TabLabel>{label}</TabLabel>
              {closable ? <TabClose label={label} active={selected} onClose={closeMap} /> : null}
            </div>
          );
        })}
        {docked.map((t) => tabView(t, t.key === upFront?.key, true))}
        <NewTab
          onMap={() => {
            setFront((f) => ({ ...f, [here]: null }));
            openInTab(map.name, []);
          }}
        />
        <DropMarker drop={drop} />
      </header>
      <div
        ref={setMainSlot}
        className={cn("relative min-h-0 flex-1 bg-paper", upFront ? "pointer-events-auto" : "invisible")}
      />
      {upFront?.pty !== undefined ? (
        <div data-chrome className="pointer-events-auto bg-surface-container-low">
          <Strip
            tab={upFront}
            pty={upFront.pty}
            agents={upFront.found === false ? others : agents}
            onRun={(id) => patch(upFront.key, { ran: id })}
          />
        </div>
      ) : null}
    </section>
    {dragging ? (
      <>
        {/* Where the tab will go, shown before it is let go. */}
        <div
          aria-hidden
          style={
            dragging.to === "panel"
              ? { top: (desktop ? TITLEBAR : 0) + GAP, bottom: STATUSBAR + GAP, right: GAP, left: panelLeft() }
              : { top: desktop ? TITLEBAR : 0, bottom: STATUSBAR, left: 0, right: shown ? window.innerWidth - panelLeft() + GAP : 0 }
          }
          className="pointer-events-none fixed z-50 border-2 border-dashed border-accent/60 bg-accent/8"
        />
        <div
          aria-hidden
          style={{ left: dragging.x + 12, top: dragging.y + 10 }}
          className="pointer-events-none fixed z-50 flex items-center gap-1.5 border border-border-gray bg-card px-2.5 py-1 text-[12px] text-ink shadow-lift"
        >
          {(() => {
            const t = tabs.find((x) => x.key === dragging.key);
            return t ? (
              <>
                {iconOf(t)}
                {nameOf(t)}
                <span className="text-faint">→ {dragging.to === "panel" ? "window" : "main view"}</span>
              </>
            ) : null;
          })()}
        </div>
      </>
    ) : null}
    {/* With the window closed, its agents float in the corner, so one still
        working, or done and waiting to be read, is not lost from sight. */}
    {!shown && panel.some((t) => t.status) ? (
      <motion.div
        drag
        dragMomentum={false}
        dragConstraints={{ top: 0, left: -window.innerWidth, right: 0, bottom: window.innerHeight }}
        onDragStart={() => (dotsMoved.current = true)}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        style={{ x: dotsX, y: dotsY, right: GAP, top: (desktop ? TITLEBAR : 0) + GAP }}
        title="Drag to move"
        data-chrome
        className="fixed z-40 flex cursor-grab flex-col items-center gap-0.5 rounded-full border border-border-gray bg-card p-0.5 shadow-lift active:cursor-grabbing"
      >
        {panel
          .filter((t) => t.status)
          .map((t) => (
            <button
              key={t.key}
              type="button"
              // A drag ends on a button too: only a press that stayed put opens it.
              onPointerDown={() => (dotsMoved.current = false)}
              onClick={() => !dotsMoved.current && bring(t.key)}
              title={`${nameOf(t)}: ${DOT[t.status!].label}`}
              className="flex size-5 cursor-pointer items-center justify-center rounded-full hover:bg-surface-container"
            >
              <StatusDot status={t.status!} />
            </button>
          ))}
      </motion.div>
    ) : null}
    {tabs.map((t) => {
          const inView = (x: Tab) => (x.main ? x.cwd === here && x.key === upFront?.key : shown && x.key === current?.key);
          // A dev server is drawn under the toolbar of its project's Preview in
          // view, so any of them can switch to it; else under the first.
          const serverIn = (cwd: string) => {
            const pages = tabs.filter((x) => x.kind === "preview" && x.cwd === cwd);
            const seen = pages.filter(inView);
            return seen.find((x) => serverShown[x.key]) ?? seen[0] ?? pages[0];
          };
          const host = t.dev ? serverIn(t.cwd) : t;
          const visible = !!host && inView(host) && (!t.dev || !!serverShown[host.key]);
          const slot = host?.main ? mainSlot : panelSlot;
          if (t.kind === "preview") {
            const dev = tabs.find((x) => x.dev && x.cwd === t.cwd);
            const sites = projects[t.cwd]?.web ?? [];
            // Only the Preview the dev server's terminal is drawn in can switch
            // to it; with none running, switching starts it.
            const owns = (!!dev || sites.length > 0) && serverIn(t.cwd) === t;
            return (
              <Held key={t.key} slot={slot}>
              <Preview
                id={t.key}
                root={t.cwd}
                target={servers[t.cwd]}
                visible={visible}
                waiting={servers[t.cwd] ? undefined : dev?.run}
                asking={dev ? asking[t.cwd] : undefined}
                onAnswer={(yes) => {
                  if (dev?.pty !== undefined) void invoke("pty_write", { id: dev.pty, data: yes ? "y\r" : "n\r" });
                  setAsking((all) => ({ ...all, [t.cwd]: undefined }));
                }}
                serverShown={owns && serverShown[t.key]}
                onServer={
                  owns
                    ? (on) => {
                        if (on && !dev) startDev(t.cwd, undefined, true);
                        setServerShown((s) => ({ ...s, [t.key]: on }));
                      }
                    : undefined
                }
                sites={owns && sites.length > 1 ? sites.map((x) => x.dir) : undefined}
                site={dev?.site}
                onSite={(dir) => switchSite(t.cwd, dir)}
                onStart={owns && !dev ? () => startDev(t.cwd, undefined, true) : undefined}
                docked={!!t.main}
              />
              </Held>
            );
          }
          if (t.kind === "plan") {
            const claude = tabs.find((x) => x.key === t.of);
            return !t.plan ? null : (
              <Held key={t.key} slot={slot}>
              <PlanView
                plan={t.plan}
                visible={visible}
                status={claude?.status}
                pty={claude?.pty}
                read={() => (t.of === undefined ? [] : (screens.current[t.of]?.() ?? []))}
                onAnswered={(next) => {
                  const at = next.state === "approved" ? { approvedAt: Date.now() } : {};
                  setTabs((all) => all.map((x) => (x.key === t.key && x.plan ? { ...x, plan: { ...x.plan, ...next, ...at } } : x)));
                }}
                onShowClaude={claude ? () => bring(claude.key) : undefined}
                // The window floats over the main view's right; the plan keeps clear of it.
                inset={t.main ? inset : undefined}
              />
              </Held>
            );
          }
          if (t.kind === "file")
            return !t.file ? null : (
              <Held key={t.key} slot={slot}>
                <FileTab path={t.file} line={t.line} visible={visible} inset={t.main ? inset : undefined} />
              </Held>
            );
          if (t.kind !== "shell")
            return (
              <Held key={t.key} slot={slot}>
              <Device
                platform={t.kind}
                root={t.cwd}
                visible={visible}
                onCommand={(command, label) => add(null, { run: command, label, cwd: t.cwd })}
              />
              </Held>
            );
          const shell = (
          <Shell
            startClaude={t.start === CLAUDE.id}
            claude={!!t.live}
            resume={t.resume}
            run={t.run ?? (t.start && t.start !== CLAUDE.id ? agentById(t.start)?.command : undefined)}
            cwd={t.cwd || undefined}
            visible={visible}
            onOutput={(text) => {
              if (t.dev) heard(t, text);
              printing(t.key, text);
            }}
            onInput={() => {
              typed.current[t.key] = Date.now();
              rang.current[t.key] = false;
              // The user restarting the dev server: the address it prints next is followed.
              if (t.dev) tails.current[t.key] = "";
            }}
            onTitle={(title) => patch(t.key, { title })}
            onScreen={(read) => (screens.current[t.key] = read)}
            onClaude={(found) => patch(t.key, { found })}
            onOpenPlan={() => reopenPlan(t.key, t.cwd)}
            session={t.session}
            onOpenFile={(file, line) => openFile(t.cwd, file, line)}
            onSpawn={(pty) => {
              patch(t.key, { pty });
              tabStarted(pty, t.start === CLAUDE.id);
            }}
            onExit={() => !borrowed.current.has(t.key) && close(t.key)}
          />
          );
          return (
          <Held key={t.key} slot={slot}>
            {t.dev ? (
              // Clear of the window in the main view, as its Preview is (components/preview.tsx).
              <div className={cn("absolute inset-x-0 top-9 bottom-0", !visible && "hidden")} style={host?.main ? { right: "var(--workspace-inset, 0px)" } : undefined}>
                {shell}
              </div>
            ) : (
              shell
            )}
          </Held>
          );
        })}
    </>
  );
}

/**
 * A tab's body, drawn into one element for the tab's life and moved, never
 * drawn again, between the window and the main view: a terminal drawn again
 * would be a new shell.
 */
function Held({ slot, children }: { slot: HTMLElement | null; children: React.ReactNode }) {
  const [box] = useState(() => {
    if (typeof document === "undefined") return null;
    // No box of its own: the body is laid out in the slot, and a hidden tab's
    // holder never lies over the one in view.
    const el = document.createElement("div");
    el.style.display = "contents";
    return el;
  });
  useLayoutEffect(() => {
    if (box && slot && box.parentElement !== slot) slot.appendChild(box);
  }, [box, slot]);
  useEffect(() => () => box?.remove(), [box]);
  return box ? createPortal(children, box) : null;
}

/**
 * A project with a phone app is asked, once, whether to run it here. Picking
 * one opens its tab, which says what it needs before anything is installed.
 */
function Offer({ phones, onPick, onDismiss }: { phones: Platform[]; onPick: (p: Platform) => void; onDismiss: () => void }) {
  const what = phones.length > 1 ? "iOS and Android apps" : phones[0] === "ios" ? "an iOS app" : "an Android app";
  return (
    <motion.div
      role="dialog"
      aria-label="Run the phone app here"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
      style={{ bottom: STATUSBAR + GAP }}
      className="fixed left-3 z-40 flex max-w-[340px] flex-col gap-2.5 border border-border-gray bg-card p-3.5 shadow-lift"
    >
      <p className="text-[13px] leading-snug text-ink">
        This project has {what}. Run {phones.length > 1 ? "them" : "it"} here, in the app?
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        {phones.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPick(p)}
            className="flex cursor-pointer items-center gap-1.5 border border-border-strong px-2.5 py-1 text-[12px] text-ink hover:bg-surface-container"
          >
            <PhoneIcon />
            {p === "ios" ? "iOS Simulator" : "Android emulator"}
          </button>
        ))}
        <button type="button" onClick={onDismiss} className="ml-auto cursor-pointer px-1 text-[12px] text-faint hover:text-ink">
          Not now
        </button>
      </div>
    </motion.div>
  );
}

/** A page: the Preview tab. Drawn like the terminal glyph. */
function GlobeIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden className="size-3 shrink-0">
      <circle cx="8" cy="8" r="6" />
      <path d="M2 8h12M8 2c1.7 1.8 2.5 3.8 2.5 6S9.7 12.2 8 14C6.3 12.2 5.5 10.2 5.5 8S6.3 3.8 8 2Z" />
    </svg>
  );
}

/** A page with a check: a plan's tab. */
function PlanIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3 shrink-0">
      <path d="M4 1.5h5.5L12 4v10.5H4z" />
      <path d="m6.2 9.2 1.4 1.4 2.4-2.8" />
    </svg>
  );
}

/** A page with a folded corner: a file's tab. */
function FileIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="size-3 shrink-0">
      <path d="M4 1.5h5.5L12 4v10.5H4z" />
      <path d="M9.5 1.5V4H12" />
    </svg>
  );
}

/** A phone: the iOS and Android tabs. */
function PhoneIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden className="size-3 shrink-0">
      <rect x="4" y="1.5" width="8" height="13" rx="2" />
      <path d="M7 12h2" />
    </svg>
  );
}

/** Asks for the map to follow a turn that edited `root`; a checkout no project maps is said so in the title bar. */
export async function followTurn(root: string, turn: Turn) {
  const res = await updateMap(root, turn);
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
const DOT: Record<Status, { colour: string; label: string }> = {
  working: { colour: "bg-[#f0c674]", label: "Working" },
  waiting: { colour: "bg-[#cf3e3e]", label: "Needs you" },
  done: { colour: "bg-[#4caf50]", label: "Done" },
};

/** Yellow while the agent works, red when it waits on the user, green when it is done. */
export function StatusDot({ status }: { status: Status }) {
  const { colour, label } = DOT[status];
  return (
    <span role="img" aria-label={label} title={label} className="relative flex size-2">
      {status !== "done" && <span className={cn("absolute inset-0 animate-ping rounded-full opacity-60", colour)} />}
      <span className={cn("relative size-2 rounded-full", colour)} />
    </span>
  );
}

let audio: AudioContext | null = null;
/** Two soft notes, rising when done and falling when the agent needs the user. */
function chime(status: Status) {
  try {
    audio ??= new AudioContext();
    const notes = status === "done" ? [660, 880] : [700, 520];
    notes.forEach((hz, i) => {
      const at = audio!.currentTime + i * 0.14;
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      osc.connect(gain).connect(audio!.destination);
      osc.start(at);
      osc.stop(at + 0.32);
    });
  } catch {
    /* no audio: the dot still says it */
  }
}

function inFront(t: Tab): Agent | undefined {
  if (t.live) return CLAUDE;
  if (t.busy && t.ran !== CLAUDE.id) return agentById(t.ran ?? undefined);
  return undefined;
}

/**
 * The line under the terminal, with the shell at its prompt: the agents to
 * start here. What is handed to Claude is named in its prompt instead
 * (lib/context.ts `mention`).
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
  if (tab.live || tab.busy) return null;
  const run = (a: Agent) => {
    onRun(a.id);
    void invoke("pty_write", { id: pty, data: `${a.command}\r` });
  };
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-torder-gray px-3 py-1.5 font-mono text-[11px] [scrollbar-width:none]">
      {agents.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => run(a)}
          title={
            a.id === CLAUDE.id
              ? "Runs slop-claude in this shell: your Claude Code, able to take map context"
              : `Runs ${a.command} in this shell`
          }
          className="flex shrink-0 cursor-pointer items-center gap-1.5 border border-border-strong px-2 py-px text-ink hover:bg-surface-container"
        >
          <AgentIcon id={a.id} />
          {a.id === CLAUDE.id ? "Claude" : a.label}
        </button>
      ))}
      {tab.found === false ? (
        <span className="shrink-0 text-faint">
          Claude Code was not found.{" "}
          <button type="button" onClick={openSettings} className="cursor-pointer text-accent underline">
            Open Settings
          </button>
        </span>
      ) : null}
    </div>
  );
}
