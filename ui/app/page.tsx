import { Suspense } from "react";
import { Canvas } from "@/components/canvas";

// The open level lives in the URL, and `useSearchParams` needs a Suspense
// boundary to prerender.
export default function Home() {
  return (
    <Suspense>
      <Canvas />
    </Suspense>
  );
}
