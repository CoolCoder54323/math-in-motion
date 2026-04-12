import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // manim-web bundles opentype.js, which contains a few `require("fs")`
    // calls behind a runtime `isBrowser()` guard. Turbopack still has to
    // resolve those specifiers when building the browser-targeted bundle,
    // so we map `fs` to an empty stub under the `browser` condition only —
    // server code keeps the real Node module.
    resolveAlias: {
      fs: { browser: "./stubs/empty.js" },
    },
  },
};

export default nextConfig;
