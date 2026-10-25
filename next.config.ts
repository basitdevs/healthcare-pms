import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Live SQLite data on every request: use the classic (non-Cache-Components) model.
  cacheComponents: false,
  serverExternalPackages: ["better-sqlite3"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
