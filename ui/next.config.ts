import type { NextConfig } from "next";

// scripts/export-static.mts builds one map as a static site; otherwise this is the dev app.
const exporting = !!process.env.NEXT_PUBLIC_STATIC_MAP;

const nextConfig: NextConfig = exporting
  ? { output: "export", basePath: process.env.NEXT_PUBLIC_BASE_PATH, distDir: process.env.SLOP_EXPORT_DIR }
  : {};

export default nextConfig;
