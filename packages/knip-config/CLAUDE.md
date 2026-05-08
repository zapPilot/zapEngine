See @../../CLAUDE.md for monorepo development guidelines.

# Package-Specific Constraints

- `defineKnipConfig` deep-merges `ignoreDependencies` with `baseConfig.ignoreDependencies` but shallow-spreads everything else. If you add a new field to the base, also extend the merge logic in `base.mjs` — otherwise per-workspace overrides will silently drop it.
- The `eslint` field is set to a default object but consumers can pass `eslint: false` to disable knip's ESLint integration entirely (see `apps/landing-page/knip.ts` — needed because `eslint-config-next` pulls in `@rushstack/eslint-patch`, which rejects non-ESLint callers).
- This package has no build step. The runtime is `base.mjs` plus a hand-maintained `base.d.ts` declaration. Keep them in sync when changing the export surface.
