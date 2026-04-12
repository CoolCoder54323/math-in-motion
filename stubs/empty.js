// Empty stub used by `turbopack.resolveAlias` to satisfy bare `require("fs")`
// calls inside browser-bound dependencies (notably the opentype.js code paths
// bundled into manim-web's featureFlags chunk). Those calls live behind an
// `if (isBrowser())` check at runtime, so they're never actually executed in
// the browser — but the bundler still has to resolve the specifier.
module.exports = {};
