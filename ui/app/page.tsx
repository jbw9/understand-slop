import { Suspense } from "react";
import { Canvas } from "@/components/canvas";
import { SettingsDialog } from "@/components/settings";
import { TerminalPanel } from "@/components/terminal";
import { Titlebar } from "@/components/titlebar";

// The open level lives in the URL, and `useSearchParams` needs a Suspense
// boundary to prerender. The title bar sits above the map, and the terminal
// under it takes its height from the map, as VS Code's panel does from the
// editor.
export default function Home() {
  return (
    <div className="flex h-full flex-col">
      <Titlebar />
      <div className="min-h-0 flex-1">
        <Suspense>
          <Canvas />
        </Suspense>
      </div>
      <TerminalPanel />
      <SettingsDialog />
    </div>
  );
}
