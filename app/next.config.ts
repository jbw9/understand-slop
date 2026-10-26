import { PHASE_DEVELOPMENT_SERVER } from "next/constants";
import type { NextConfig } from "next";

// scripts/export-static.mts builds one map as a static site; otherwise this is the dev app.
const exporting = !!process.env.NEXT_PUBLIC_STATIC_MAP;

export default function config(phase: string): NextConfig {
  if (exporting) return { output: "export", basePath: process.env.NEXT_PUBLIC_BASE_PATH, distDir: process.env.SLOP_EXPORT_DIR };
  // In dev the landing page (../landing) frames this app through its own
  // origin, and both are Next apps with chunks of the same names under
  // /_next. Its own prefix lets the landing's proxy tell this app's apart.
  return phase === PHASE_DEVELOPMENT_SERVER ? { assetPrefix: "/slop-app" } : {};
}
