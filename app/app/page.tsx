import { Suspense } from "react";
import { Acts } from "@/components/acts";
import { Canvas } from "@/components/canvas";
import { DiffMode } from "@/components/diff";
import { DiffPanel } from "@/components/diff-panel";
import { MapProvider } from "@/components/map-context";
import { ProjectsDialog } from "@/components/projects";
import { HistoryDialog } from "@/components/history";
import { SettingsDialog } from "@/components/settings";
import { Titlebar } from "@/components/titlebar";
import { Workspace } from "@/components/workspace";
import { listMaps, loadMap, remoteOf, rootOf } from "@/lib/maps";
import { STATIC_MAP } from "@/lib/source";

// The open level lives in the URL, and `useSearchParams` needs a Suspense
// boundary to prerender. `?map=` picks which repository's map is read. In the
// desktop app the title bar sits above the map, which takes the rest of the
// height; the workspace (Claude Code and terminal tabs) floats over it on the
// right. All of them live inside the provider, so they know which map (and
// checkout) is open.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // A static export serves one map and must not read the request.
  const asked = STATIC_MAP ?? (await searchParams).map;
  // The landing page frames one map at a time and switches between them itself.
  const embed = !STATIC_MAP && (await searchParams).embed !== undefined;
  const { name, file } = loadMap(typeof asked === "string" ? asked : undefined);
  file.RUN.url ??= remoteOf(file.RUN);
  // A published page has no checkout to read, and must not carry this machine's paths.
  // The desktop app's tabs start in the checkout, so it is named in full.
  if (STATIC_MAP) delete file.RUN.root;
  else file.RUN.root = rootOf(file.RUN);
  return (
    <MapProvider name={name} file={file} maps={STATIC_MAP || embed ? [{ id: name, label: name, local: false }] : listMaps()}>
      <div className="flex h-full flex-col">
        {/* The title bar reads the open level from the URL, as the map does. */}
        <Suspense>
          <Titlebar />
        </Suspense>
        <div className="min-h-0 flex-1">
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
        <SettingsDialog />
        <ProjectsDialog />
        <HistoryDialog />
      </div>
    </MapProvider>
  );
}
