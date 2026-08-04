import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  turbopack: {
    // Explicitly tell Turbopack the monorepo root is the parent folder (../),
    // so it stops guessing and the "multiple lockfiles" warning is silenced.
    root: path.resolve(__dirname, ".."),
  },
};

export default nextConfig;
