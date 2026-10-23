import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop app (src-tauri/) loads the UI as static files from out/; the
  // repository is read through Tauri commands, so there is no server.
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
