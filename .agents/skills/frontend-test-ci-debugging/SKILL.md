---
name: frontend-test-ci-debugging
description: >-
  Use when @zapengine/frontend test:ci or test:coverage fails in CI — especially
  a Vitest/jsdom module-load crash ("Unexpected token 'export'", "seems to be an
  ES Module but shipped in a CommonJS package") from a transitive node_modules
  dep (jayson, uuid, @solana/web3.js, @lifi/sdk), a "[coverage] Batch N/… could
  not be split further" hard-fail, or "Found multiple elements" batch failures —
  and tweaking vite.config resolve.alias / server.deps.inline / ssr.noExternal /
  pool does not fix it.
---

# Frontend test:ci / coverage debugging

## Core principle

When a Vitest test crashes **at module load** because of a transitive
node_modules dependency, **`vite.config` knobs do not fix it**:
`resolve.alias`, `server.deps.inline`, `ssr.noExternal`, `optimizeDeps`, and
even flipping `pool` only affect modules Vite **transforms**. Vitest
externalizes node_modules and loads them with native Node `require`, which
bypasses all of those. They work for `vite build` (so the build stays green
while tests crash) — that asymmetry is the tell.

**The fix is at the source**: stop the offending package from importing the
heavy SDK at module top-level, or `vi.mock` it at the `src → package` boundary.

## Know the runner first (one-time orientation)

`apps/frontend` → `test:ci` → `test:coverage` → [scripts/run-sharded-coverage.js](../../../apps/frontend/scripts/run-sharded-coverage.js):
runs test files in **batches of 3** and **bisects a failing batch down to single
files**.

- **Only a single-file hard-fail blocks CI** — the message
  `[coverage] Batch N/… could not be split further` names that file. That is the
  real failure.
- **`Found multiple elements` / a batch that passes once split = cross-file
  pollution.** The runner bisects it away; it is **not** a CI blocker. Don't
  chase it.
- CI stops at the **first** hard-fail, so latent failures hide behind it. Fixing
  one advances CI to the next — this is why it "keeps failing." Expect a cascade.
- Both the `coverage` job and the `lint-test` job run the frontend coverage, so
  one root cause fails both jobs.

## Diagnose — don't guess

1. Reproduce the named file **alone, with coverage** (matches the runner):
   ```bash
   cd apps/frontend && pnpm exec vitest run --coverage \
     --coverage.processingConcurrency=1 <file>
   ```
2. Classify the failure:
   | Symptom (running the file alone) | Class | Where to fix |
   | --- | --- | --- |
   | `SyntaxError: Unexpected token 'export'` at **import** of a node_modules file | ESM-only transitive dep | source package (below) |
   | Assertion fails alone (e.g. `Cannot redefine property: location`) | real test/component bug | the test itself |
   | Passes alone, only fails in a batch (`Found multiple elements`) | pollution | nothing — runner bisects it |
3. **CI (Node 24) is authoritative.** Local Node may differ (the runner is
   "validated on Node 24"). A local pass doesn't guarantee CI, and a local-only
   failure may not reflect CI — push and read the CI log before declaring done.

## ESM-only transitive dep crash — the trap and the fix

**The trap** (this exact issue burned 5 `fixCI` commits + an autofix loop):
adding the dep to `vite.config` `server.deps.inline` / `resolve.alias` /
`ssr.noExternal`, flipping `pool`, or rewriting a barrel import to a deep path to
dodge it. None of these reach a transitively-`require()`d dep inside an
externalized package, because:

- Alias/inline/`vi.mock` only intercept imports made **from Vitest-controlled
  (src / inlined) code**. A deep `require()` from an already-externalized package
  is invisible to them.
- Workspace packages resolve to their **real path** (`packages/X/dist/…`), so an
  inline regex keyed on `@scope/name` never matches.

**The fix — decide:**

- **You can edit the package that pulls the chain** (e.g. `packages/intent-engine`)
  → **root fix**: defer whatever evaluates the chain at module load. The eager
  trigger is usually a top-level static `import { … } from '<heavy-sdk>'`, but
  can also be a **module-level singleton** (`export const x = createThing(…)`)
  that instantiates it. Convert the static import to a **dynamic `import()`
  inside the (already-async) methods**, and/or make the singleton lazy (build it
  on first access). Importing the package then no longer evaluates the chain;
  bundlers still resolve it for production (it becomes a lazy chunk). **This is
  the only fix that also satisfies tests which `importActual`/`importOriginal`
  the real package** — a `vi.mock` cannot, because those force the real chain to
  load. Trace from the crashing leaf upward to find the first eager evaluation.
- **You cannot edit the package** → `vi.mock('<package>', factory)` in a setup
  file. Works because the importer is src/inlined. Does **not** help tests that
  `importActual` the real package.
- **Never** try to make the whole real chain loadable. It's whack-a-mole — cut
  one ESM-only dep (jayson) and the next surfaces (uuid, then more).

### Before / after (the real fix that unblocked CI)

`packages/intent-engine/src/adapters/lifi.adapter.ts` dragged
`@lifi/sdk → @solana/web3.js → jayson/lib/client/browser → require('uuid')`
(uuid@14 is ESM-only) into every test that imports the intent engine.

```ts
// ❌ before — top-level static import evaluates the whole Solana chain at load
import { createConfig, getQuote, getToken } from '@lifi/sdk';

// ✅ after — types stay (erased); values load lazily on first use
import type { QuoteRequest } from '@lifi/sdk';

private sdkPromise?: Promise<typeof import('@lifi/sdk')>;
private loadSdk() {
  this.sdkPromise ??= import('@lifi/sdk').then((sdk) => {
    sdk.createConfig({ integrator: this.config.integrator });
    return sdk;
  });
  return this.sdkPromise;
}
// in each async method: const { getQuote } = await this.loadSdk();
```

## Common mistakes / red herrings

| Belief | Reality |
| --- | --- |
| "CI's eslint/prettier rewrote my file, so it keeps failing" | CI runs `eslint .` / `prettier --check` — **read-only**. File mutation is not the cause. |
| "Passes alone, fails in a batch → the runner is broken" | That's pollution; the sharded runner bisects it. Not a blocker. |
| "Add the dep to `server.deps.inline` / alias / `ssr.noExternal`" | No effect on externalized transitive deps. Build-only knobs. |
| "Flip `pool` / rewrite the barrel import to a deep path" | Config-level dodging; fragile, and the deep-path rewrite violates the barrel-import convention. Fix the source. |
| "It fails on my Node, must be a local artifact" | Maybe — but verify on CI (Node 24). Some local failures are real on CI too. |

## Verification

- Reproduce the named file alone → crash gone.
- Edited a package? `pnpm turbo run test type-check lint --filter=@zapengine/<pkg>`
  and `pnpm --filter @zapengine/frontend run build` (lazy import must not break the
  prod bundle).
- Push and read CI (Node 24). Expect the cascade to advance to the next hard-fail
  if one exists — fix iteratively.
