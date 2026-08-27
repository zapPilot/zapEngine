import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // knip runs per package and cannot discover sibling-workspace consumers.
  // package.json now enumerates the supported barrels and deep imports, which
  // knip automatically treats as entries. Do not restore a wildcard here or in
  // package exports: either one would hide every orphaned implementation file.
  project: ['src/**/*.{ts,tsx}'],
  // Both are used through subpath/type-only imports that knip's workspace
  // resolver does not consistently attribute to the package dependency.
  ignoreDependencies: ['@zapengine/intent-engine', '@zapengine/types'],
  // Privy and wagmi are optional peers on purpose: they are referenced only
  // behind web-specific entry points so React Native can consume app-core
  // without installing them.
  exclude: ['optionalPeerDependencies'],
});
