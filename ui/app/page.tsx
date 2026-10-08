import { Explorer } from "@/components/explorer";
import { MapLoader } from "@/components/map-context";

export default function Home() {
  return (
    <MapLoader>
      <Explorer />
    </MapLoader>
  );
}
