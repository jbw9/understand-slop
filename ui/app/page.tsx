import { Suspense } from "react";
import { Canvas } from "@/components/canvas";
import { MapProvider } from "@/components/map-context";
import { listMaps, loadMap } from "@/lib/maps";

// The open level lives in the URL, and `useSearchParams` needs a Suspense
// boundary to prerender. `?map=` picks which repository's map is read.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const asked = (await searchParams).map;
  const { name, file } = loadMap(typeof asked === "string" ? asked : undefined);
  return (
    <MapProvider name={name} file={file} maps={listMaps()}>
      <Suspense>
        {/* Keyed by map: a switch starts fresh, never mid-transition from the old tree. */}
        <Canvas key={name} />
      </Suspense>
    </MapProvider>
  );
}
