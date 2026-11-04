import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // A stray package.json sits in the home folder. The tooling must not treat home as the workspace.
    root: import.meta.dirname,
  },
};

export default nextConfig;
