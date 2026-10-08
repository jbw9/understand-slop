import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The indexer runs the TypeScript compiler on the server; load it from
  // node_modules rather than bundling it.
  serverExternalPackages: ["typescript"],
};

export default nextConfig;
