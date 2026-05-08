See @../../CLAUDE.md for monorepo development guidelines.

# Package-Specific Constraints

- Each `*.mjs` file in this package is a flat-config factory. Add new presets as new top-level files; do not nest under subdirectories — the `exports` map points directly at filenames.
- When adding or removing rules, every consumer eslint config inherits the change at the next install. Run `pnpm lint` across the affected workspaces before merging — a single rule flip can cascade.
- Plugin versions live as `dependencies` here (not `peerDependencies`) so consumers don't need to duplicate them. Only `eslint` and `eslint-config-next` are peers.
- This package is also the lint-staged formatter for everything under `packages/**` (see root `package.json` lint-staged config). Touching its dependencies can affect commit-time formatting across the whole `packages/` tree.
