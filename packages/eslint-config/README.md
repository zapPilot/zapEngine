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
// apps/frontend/eslint.config.mjs
import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';

export default createReactViteConfig({
  // optional per-app overrides
});
```

```js
// packages/intent-engine/eslint.config.mjs
import { createNodeTsConfig } from '@zapengine/eslint-config/node-ts';

export default createNodeTsConfig();
```

## Conventions baked in

- Flat config (`eslint.config.mjs`), not legacy `.eslintrc`
- Plugins enabled across presets: `@typescript-eslint`, `import`, `simple-import-sort`, `unicorn`, `sonarjs`, `promise`, `no-secrets`, `prettier`
- React presets add `react`, `react-hooks`, and `jsx-a11y`
- ES module imports only (`import`/`export`); CommonJS is disallowed at the monorepo level

## Peer dependencies

- `eslint` ^9 (host app provides)
- `eslint-config-next` ^15 (only required when consuming `./next`)

See [CLAUDE.md](../../CLAUDE.md) for monorepo development guidelines.
