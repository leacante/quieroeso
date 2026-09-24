// TypeScript 7 ships without the programmatic compiler API (expected in 7.1).
// typescript-eslint still needs it, so its packages resolve `typescript` to the
// TypeScript 6 compatibility package while the rest of the repo uses TS 7.
// See docs/adr/0002-typescript-7.md.
const TS6 = "npm:@typescript/typescript6@6.0.2";
const NEEDS_TS_API = [
  /^@typescript-eslint\//,
  /^typescript-eslint$/,
  /^eslint-import-resolver-typescript$/,
];

function readPackage(pkg) {
  if (NEEDS_TS_API.some((re) => re.test(pkg.name))) {
    if (pkg.peerDependencies?.typescript) {
      delete pkg.peerDependencies.typescript;
      if (pkg.peerDependenciesMeta) delete pkg.peerDependenciesMeta.typescript;
    }
    pkg.dependencies = { ...pkg.dependencies, typescript: TS6 };
  }
  return pkg;
}

module.exports = { hooks: { readPackage } };
