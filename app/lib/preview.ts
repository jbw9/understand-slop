/**
 * The previews open in the workspace, one per project, and how a call from
 * Claude reaches one (src-tauri/src/mcp.rs): it arrives as a `slop:preview`
 * event naming the tab Claude runs in, the workspace finds that tab's
 * project (components/workspace.tsx), and the project's preview runs it
 * (components/preview.tsx).
 */

export type Call =
  | { op: "frame" }
  | { op: "agent"; name: string; args: Record<string, unknown> }
  | { op: "navigate"; url: string }
  | { op: "resize"; args: { width?: number; height?: number; preset?: string } }
  | { op: "console"; args: { pattern?: string; only_errors?: boolean; clear?: boolean; limit?: number } };

export interface PreviewHandle {
  run(call: Call): Promise<unknown>;
}

const handles = new Map<string, PreviewHandle>();

/** A project's preview, while it is mounted. Returns its removal. */
export function registerPreview(root: string, handle: PreviewHandle) {
  handles.set(root, handle);
  return () => {
    if (handles.get(root) === handle) handles.delete(root);
  };
}

export const previewOf = (root: string) => handles.get(root);

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

/** `host:port` of an address, for telling one server from another. */
export function hostOf(url: string): string | null {
  const m = url.match(/^(?:https?:\/\/)?((?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d+)/);
  return m ? m[1].replace("0.0.0.0", "localhost") : null;
}
