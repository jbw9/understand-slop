import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";
import { join } from "node:path";

/**
 * The landing page is a static site, published at the root of the Pages
 * branch with each demo map's own export beside it (app/scripts/export-static.mts).
 * Its demo reaches into the framed map for the tour, so the map has to be on
 * this page's origin: in dev, everything this app does not serve itself is
 * handed to the app's dev server (its pages, assets and /api), so
 * `/?map=…&embed` framed here is the live app.
 */
export default function config(phase: string): NextConfig {
  // The design tokens and the theme script are the app's own (../app), read in place.
  const shared: NextConfig = { turbopack: { root: join(__dirname, "..") } };
  if (phase === PHASE_DEVELOPMENT_SERVER) {
    const app = process.env.SLOP_APP_URL ?? "http://localhost:3000";
    return {
      ...shared,
      async rewrites() {
        return {
          beforeFiles: [
            { source: "/", has: [{ type: "query", key: "map" }], destination: `${app}/` },
            // The app's own assets (its assetPrefix, ../app/next.config.ts): same names as this page's under /_next.
            { source: "/slop-app/:path*", destination: `${app}/slop-app/:path*` },
          ],
          afterFiles: [],
          fallback: [{ source: "/:path*", destination: `${app}/:path*` }],
        };
      },
    };
  }
  return { ...shared, output: "export", basePath: process.env.NEXT_PUBLIC_BASE_PATH };
}
