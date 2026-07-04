# @zapengine/tsconfig

Shared TypeScript compiler-config presets. Every TypeScript workspace extends one of these via its `tsconfig.json`.

## Presets

| File         | Use for                                     | Module/resolution    | Consumers                                                                                              |
| ------------ | ------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| `base.json`  | Foundation (extended by `node` and `react`) | n/a (no module set)  | (extended internally; not consumed directly)                                                           |
| `node.json`  | Node libraries and services (emit + types)  | `NodeNext`           | `apps/{account-engine, alpha-etl, podcast-pipeline}`, `packages/{design-tokens, intent-engine, types}` |
| `react.json` | React 19 + bundler-driven apps              | `ESNext` / `Bundler` | `apps/{desktop, landing-page}`                                                                        |

`base.json` enforces strict mode plus the stricter-than-default flags `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, and `noFallthroughCasesInSwitch`. All presets inherit these.

## Usage

```jsonc
// apps/desktop/tsconfig.json
{
  "extends": "@zapengine/tsconfig/react.json",
  "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
  },
  "include": ["src/**/*"],
}
```

```jsonc
// apps/account-engine/tsconfig.json
{
  "extends": "@zapengine/tsconfig/node.json",
  "compilerOptions": { "outDir": "./dist", "rootDir": "./src" },
  "include": ["src/**/*"],
}
```

## Why two module modes

`react.json` uses `module: ESNext` + `moduleResolution: Bundler` because Vite (desktop) and Next.js (landing-page) handle module resolution themselves; using `NodeNext` would force `.js` extensions in TS imports. `node.json` keeps `NodeNext` because `tsc` is the only resolver for Node services and packages that emit to disk.

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.
