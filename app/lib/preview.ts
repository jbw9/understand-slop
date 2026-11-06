/**
 * The previews open in the workspace, and how a call from Claude reaches one
 * (src-tauri/src/mcp.rs): it arrives as a `slop:preview` event naming the tab
 * Claude runs in, the workspace finds that tab's project and the Preview that
 * agent drives (components/workspace.tsx), and that preview runs it
 * (components/preview.tsx).
 */

/** `tab`: which of the project's Preview tabs, by its number from 1; null for the calling agent's own. */
export type Call = { tab?: number | null } & (
  | { op: "frame" }
  | { op: "agent"; name: string; args: Record<string, unknown> }
  /** `newTab` opens it in a Preview of its own, leaving the others as they are. */
  | { op: "navigate"; url: string; newTab?: boolean | null }
  /** Claude asking the user to sign in to a site, which waits on them (src-tauri/src/signins.rs). */
  | { op: "sign_in"; url: string }
  | { op: "resize"; args: { width?: number; height?: number; preset?: string } }
  | { op: "console"; args: { pattern?: string; only_errors?: boolean; clear?: boolean; limit?: number } }
  /** Claude reading the project's map (app/api/lookup); answered by the workspace, never a preview. */
  | { op: "map"; name: string; args: { query?: string; name?: string; file?: string; line?: number } }
  /** An agent reading a terminal of its project, the dev server's by default; answered by the workspace. */
  | { op: "terminal"; args: { name?: string; lines?: number } }
);

export interface PreviewHandle {
  run(call: Call): Promise<unknown>;
}

const handles = new Map<number, PreviewHandle>();

/** A Preview tab's preview, by the tab's key, while it is mounted. Returns its removal. */
export function registerPreview(tab: number, handle: PreviewHandle) {
  handles.set(tab, handle);
  return () => {
    if (handles.get(tab) === handle) handles.delete(tab);
  };
}

export const previewOf = (tab: number | undefined) => (tab === undefined ? undefined : handles.get(tab));

/** Sizes a viewport is often checked at, as the toolbar and Claude name them. */
export const PRESETS = [
  { id: "mobile", label: "Phone", w: 390, h: 844 },
  { id: "tablet", label: "Tablet", w: 820, h: 1180 },
  { id: "laptop", label: "Laptop", w: 1280, h: 800 },
  { id: "desktop", label: "Desktop", w: 1440, h: 900 },
] as const;

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const LOCAL = /https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+[^\s'"`<>)\]]*/;

/**
 * The address a dev server prints once it is ready: Vite's `Local:`, Next's,
 * Expo's `Web is waiting on`. Only this machine's, never the network's.
 */
export function findAddress(text: string): string | null {
  const m = text.replace(ANSI, "").match(LOCAL);
  return m ? m[0].replace("0.0.0.0", "localhost") : null;
}

const YES_NO = /\s*›?\s*\(\s*y\s*\/\s*n\s*\)\s*$/i;

/**
 * A yes-or-no question the dev server is waiting on, as the last thing it
 * printed: Create React App's "run on another port instead? (Y/n)" when the
 * port is taken. From its `?` (prompts, inquirer), else its last line.
 */
export function findQuestion(text: string): string | null {
  const t = text.replace(ANSI, "").replace(/\x1b./g, "").replace(/\r/g, "").trimEnd();
  if (!YES_NO.test(t)) return null;
  const lines = t.split("\n");
  const at = lines.findLastIndex((l) => /^\s*\?\s/.test(l));
  return lines
    .slice(at < 0 ? -1 : at)
    .join("\n")
    .replace(/^\s*\?\s*/, "")
    .replace(YES_NO, "")
    .trim();
}

/** `host:port` of an address, for telling one server from another. */
export function hostOf(url: string): string | null {
  const m = url.match(/^(?:https?:\/\/)?((?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+)/);
  return m ? m[1].replace("0.0.0.0", "localhost") : null;
}
