import { Suspense } from "react";
import { Canvas } from "@/components/canvas";
import { MapProvider } from "@/components/map-context";
import { ProjectsDialog } from "@/components/projects";
import { SettingsDialog } from "@/components/settings";
import { TerminalPanel } from "@/components/terminal";
import { Titlebar } from "@/components/titlebar";
import { listMaps, loadMap, remoteOf, rootOf } from "@/lib/maps";
import { STATIC_MAP } from "@/lib/source";

// The open level lives in the URL, and `useSearchParams` needs a Suspense
// boundary to prerender. `?map=` picks which repository's map is read. In the
// desktop app the title bar sits above the map, and the terminal under it
// takes its height from the map, as VS Code's panel does from the editor;
// both live inside the provider, so they know which map (and checkout) is open.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // A static export serves one map and must not read the request.
  const asked = STATIC_MAP ?? (await searchParams).map;
  const { name, file } = loadMap(typeof asked === "string" ? asked : undefined);
  file.RUN.url ??= remoteOf(file.RUN);
  // A published page has no checkout to read, and must not carry this machine's paths.
  // The desktop app's terminal starts in the checkout, so it is named in full.
  if (STATIC_MAP) delete file.RUN.root;
  else file.RUN.root = rootOf(file.RUN);
  return (
    <MapProvider name={name} file={file} maps={STATIC_MAP ? [{ id: STATIC_MAP, label: STATIC_MAP, local: false }] : listMaps()}>
      <div className="flex h-full flex-col">
        <Titlebar />
        <div className="min-h-0 flex-1">
          <Suspense>
            {/* Keyed by map: a switch starts fresh, never mid-transition from the old tree. */}
            <Canvas key={name} />
          </Suspense>
        </div>
        <TerminalPanel />
        <SettingsDialog />
        <ProjectsDialog />
      </div>
    </MapProvider>
  );
}
