import { Suspense } from "react";
import { Acts } from "@/components/acts";
import { Canvas } from "@/components/canvas";
import { DiffMode } from "@/components/diff";
import { DiffPanel } from "@/components/diff-panel";
import { MapProvider } from "@/components/map-context";
import { ProjectsDialog } from "@/components/projects";
import { AuditDialog } from "@/components/audit";
import { HistoryDialog } from "@/components/history";
import { SettingsDialog } from "@/components/settings";
import { Titlebar } from "@/components/titlebar";
import { Workspace } from "@/components/workspace";
import { NoProject } from "@/components/welcome";
import { Palette } from "@/components/palette";
import { StatusBar } from "@/components/statusbar";
import { listMaps, loadDemo, loadMap, remoteOf, rootOf } from "@/lib/maps";
import { STATIC_MAP } from "@/lib/source";

// The open level lives in the URL, and `useSearchParams` needs a Suspense
// boundary to prerender. `?map=` picks which repository's map is read. In the
// desktop app the title bar sits above the map and the status bar under it;
// the workspace (Claude Code and terminal tabs) floats over the map's right.
// All of them live inside the provider, so they know which map (and checkout)
// is open. `?none`, a project that is gone, or no project at all is the
// blank page instead (components/welcome.tsx).
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // A static export serves one map and must not read the request.
  const asked = STATIC_MAP ?? (await searchParams).map;
  // The landing page frames one map at a time and switches between them itself.
  const embed = !STATIC_MAP && (await searchParams).embed !== undefined;
  const wanted = typeof asked === "string" ? asked : undefined;
  const none = !STATIC_MAP && !embed && (await searchParams).none !== undefined;
  // A project asked for by name and since deleted is not quietly swapped for
  // another one: the window shows the blank page.
  const gone = !STATIC_MAP && !embed && wanted !== undefined && !listMaps().some((m) => m.id === wanted);
  // The landing frames only its own demos (D63), never one of this machine's
  // projects; a static export is a demo or a project.
  const open = none || gone ? null : embed ? loadDemo(wanted) : (STATIC_MAP ? loadDemo(wanted) : null) ?? loadMap(wanted);
  if (!open)
    return (
      <div className="flex h-full flex-col">
        <Titlebar bare />
        <NoProject maps={listMaps()} />
        <SettingsDialog />
        <ProjectsDialog />
      </div>
    );
  const { name, file } = open;
  // Only a project of the reader's has one: its map follows its file as it is rewritten.
  const version = "version" in open ? (open.version as string | undefined) : undefined;
  file.RUN.url ??= remoteOf(file.RUN);
  // A published page has no checkout to read, and must not carry this machine's paths.
  // The desktop app's tabs start in the checkout, so it is named in full.
  if (STATIC_MAP) delete file.RUN.root;
  else file.RUN.root = rootOf(file.RUN);
  return (
    <MapProvider name={name} file={file} version={version} maps={STATIC_MAP || embed ? [{ id: name, label: name, local: false }] : listMaps()}>
      <div className="flex h-full flex-col">
        {/* The title bar reads the open level from the URL, as the map does. */}
        <Suspense>
          <Titlebar />
        </Suspense>
        <div className="relative min-h-0 flex-1">
          <Suspense>
            {/* Keyed by map: a switch starts fresh, never mid-transition from the old tree. */}
            <DiffMode key={name} map={name}>
              <Canvas key={name} />
              {/* Inside the provider: the panel is the diff's own list, and
                  what Claude shows needs both the map and the diff's range. */}
              <DiffPanel />
              <Acts />
            </DiffMode>
          </Suspense>
        </div>
        <Workspace />
        {embed ? null : <StatusBar />}
        <Suspense>
          <Palette />
        </Suspense>
        <SettingsDialog />
        <ProjectsDialog />
        <HistoryDialog />
        <AuditDialog />
      </div>
    </MapProvider>
  );
}
