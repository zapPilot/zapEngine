# @zapengine/eslint-config

Shared ESLint flat-config presets for every TypeScript workspace in the zapEngine monorepo.

## Overview

Each preset is a factory that returns an array of flat-config blocks. Apps consume one preset from their own `eslint.config.mjs`.

| Export                                    | For                                            | Consumers                                            |
| ----------------------------------------- | ---------------------------------------------- | ---------------------------------------------------- |
| `@zapengine/eslint-config/node-ts`        | Node-targeting TypeScript libraries            | `packages/{design-tokens, intent-engine, types}`     |
| `@zapengine/eslint-config/backend-vitest` | Hono / Express services (Node + Vitest)        | `apps/{account-engine, alpha-etl, podcast-pipeline}` |
| `@zapengine/eslint-config/react-vite`     | React 19 + Vite SPAs                           | `apps/frontend`                                      |
| `@zapengine/eslint-config/next`           | Next.js 15 apps (extends `eslint-config-next`) | `apps/landing-page`                                  |

Each factory takes an optional config override object and returns the composed flat-config array.

## Usage

```js
// apps/frontend/eslint.config.mjs (React + Vite SPA)
import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';

export default createReactViteConfig({
  // optional per-app overrides — same shape as a flat-config entry
});
```

```js
// apps/account-engine/eslint.config.mjs (Hono backend + Vitest)
import { createBackendVitestConfig } from '@zapengine/eslint-config/backend-vitest';

export default createBackendVitestConfig();
```

```js
// apps/landing-page/eslint.config.mjs (Next.js 15)
import { createNextConfig } from '@zapengine/eslint-config/next';

export default createNextConfig();
```

```js
// packages/intent-engine/eslint.config.mjs (pure TS library)
import { createNodeTsConfig } from '@zapengine/eslint-config/node-ts';

export default createNodeTsConfig();
```

## Conventions baked in

- Flat config (`eslint.config.mjs`), not legacy `.eslintrc`
- Plugins enabled across presets: `@typescript-eslint`, `import`, `simple-import-sort`, `unicorn`, `sonarjs`, `promise`, `no-secrets`, `prettier`
- React presets add `react`, `react-hooks`, and `jsx-a11y`
- ES module imports only (`import`/`export`); CommonJS is disallowed at the monorepo level

## Customising rules

The factories merge user overrides on top of the shared blocks. Pattern:

```js
// per-app override
import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';

export default [
  ...createReactViteConfig(),
  {
    files: ['src/legacy/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off', // permit deep imports in legacy code only
    },
  },
];
```

### Where to make changes — decision matrix

| Goal                                                              | Edit                                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Disable a rule for one file or directory in one app               | The app's `eslint.config.mjs` — add an override block (as shown above)                      |
| Change a rule for one **app** entirely                            | The app's `eslint.config.mjs` — override the rule globally                                  |
| Change a rule for **all** consumers of a preset                   | This package's `*.mjs` for that preset — every app picks it up on next install              |
| Add a new plugin used by every preset                             | This package — install as a dependency, register in the shared `base.mjs` (or per-preset)   |
| Add a new preset for a new stack (e.g. Cloudflare Workers, Astro) | New top-level `*.mjs` file here + add `exports` entry in `package.json`                     |
| Tweak a plugin version                                            | This package's `package.json` `dependencies` (not consumer apps — versions are pinned here) |

Before merging a preset change, run lint across at least one affected workspace (`pnpm --filter @zapengine/<app> lint`) — a single rule flip can cascade.

## Peer dependencies

- `eslint` ^9 (host app provides)
- `eslint-config-next` ^15 (only required when consuming `./next`)

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.
