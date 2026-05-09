See @../../CLAUDE.md for monorepo development guidelines.

# Package-Specific Constraints

- Three presets: `base.json` (foundation), `node.json` (NodeNext, emits to disk), `react.json` (ESNext + Bundler resolution, `noEmit: true` for Vite/Next).
- Strict-mode flags enforced from `base.json`: `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noFallthroughCasesInSwitch`. Do not relax these locally — fix the call site instead.
- `react.json` deliberately uses `module: ESNext` + `moduleResolution: Bundler` so Vite/Next consumers don't need `.js` import extensions. Switching either to `NodeNext` will break frontend / landing-page imports.
- This package has no build step. Editing any preset takes effect on the next `tsc` invocation in any consumer — coordinate broad changes (e.g. flipping a strict flag) with `pnpm type-check` across all workspaces.
