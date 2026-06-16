---
name: monorepo-build-import-errors
description: >-
  Use when a build, module-resolution, or import error in a pnpm + turbo
  monorepo resists simple fixes — TS2307 "cannot find module @scope/pkg",
  "Unexpected token 'export'" / "seems to be an ES Module but shipped in a
  CommonJS package" from a transitive node_modules dep, or a check that passes
  locally but fails in CI (or vice-versa). Symptoms: adding deps to vitest/vite
  `deps.inline` or `ssr.noExternal` and the error just moves to the next dep,
  flipping `pool`, or pinning a dep back. Not for simple type errors / deadcode.
---

# Monorepo build & import errors (pnpm + turbo)

## Core principle

**Identify the mechanism before touching any config. Reproduce the single
failing unit in isolation first.** These errors come from a few distinct
mechanisms; the fix for one is useless (or harmful) for another, and config
knobs are the most common dead end.

## Mechanism A — stale package dist / build order (TS2307)

`Cannot find module '@scope/pkg'` or its `dist/` is empty. Internal packages are
built on demand: turbo tasks declare `dependsOn: ["^build"]`, so root
`pnpm type-check` / `test` / `build` see fresh package output — **but a raw
`tsc` or `pnpm --filter X type-check` bypasses turbo** and hits TS2307 against an
empty `dist`.

**Fix:** use turbo, not pnpm filter:

```bash
pnpm turbo run type-check --filter=@zapengine/X   # respects ^build
pnpm --filter @zapengine/types build               # targeted rebuild of one dep
pnpm prebuild:packages                             # rebuild all packages (rarely needed)
```

If CI is green but you see TS2307 locally, you almost certainly skipped
`pnpm build:core` before running a turbo task.

## Mechanism B — ESM / CJS interop crash (the hard one)

> **If this is `@zapengine/frontend` `test:ci` / `test:coverage` (Vitest +
> jsdom), `frontend-test-ci-debugging` is authoritative — read it first.** It
> owns the pool / `window.location` / sharded-coverage specifics that are out of
> scope here. This skill is the general mechanism for any package.

`SyntaxError: Unexpected token 'export'` at **module load**, from a transitive
node_modules dep (e.g. `uuid@14` ESM-only, reached via
`@lifi/sdk → @solana/web3.js → jayson → require('uuid')`). **Tell:** `vite build`
(or the prod bundle) passes — only the **test runner** crashes.

### The trap — your first instinct is wrong

You will want to add the dep to **`server.deps.inline`** / **`ssr.noExternal`**,
flip **`pool`**, alias it to a CJS dist path, or pin it back. **For a dep that is
transitively `require()`d inside an *externalized* node_modules package, none of
these reach it:**

- `inline` / `alias` / `vi.mock` only intercept imports made from
  **runner-transformed (src / inlined) code**. A deep `require()` from an
  already-externalized package is invisible to them.
- So adding `uuid` to `inline` just moves the crash to the next ESM dep up the
  chain — **whack-a-mole**. Cut jayson, uuid surfaces; cut uuid, the next does.
- `vite build` passing is the tell: Rollup bundles statically and is
  format-agnostic; the test runner externalizes node_modules and `require()`s
  them with native Node, bypassing every build-only knob.

### First: is a root fix even available?

Run `pnpm why <leaf-dep>` (e.g. `pnpm why uuid`) to print the chain and see
**whether any link is a package you actually import** vs. purely transitive. The
root fix below only works if there is an eager `import`/singleton **in code you
own** that pulls the chain. If the chain enters via an un-editable core dep
(`wagmi`, a wallet connector) with **no eager import in your source**, skip
root-fix — don't hunt for an import that doesn't exist — and go straight to the
boundary fix.

### Fix A — root fix (when you own an eager import)

Stop the offending package from evaluating the heavy chain at module load:

```ts
// ❌ before — top-level static import evaluates the whole chain at load
import { getQuote } from '@lifi/sdk';

// ✅ after — types stay (erased); values load lazily on first use
import type { QuoteRequest } from '@lifi/sdk';
private sdkPromise?: Promise<typeof import('@lifi/sdk')>;
private loadSdk() {
  this.sdkPromise ??= import('@lifi/sdk');   // dynamic; bundles as a lazy chunk
  return this.sdkPromise;
}
// in each async method: const { getQuote } = await this.loadSdk();
```

This is the **only** fix that also satisfies tests that `importActual` the real
package.

### Fix B — boundary mock / shim (when the chain is purely transitive)

- `vi.mock('<pkg>', factory)` in a setup file, targeting the **first
  externalized package on the chain that your code actually imports** (the
  connector/SDK barrel), **or**
- a build-only **shim** aliased for the deep path — but the shim must alias the
  **exact module whose top-level ESM `export` crashes** (e.g. `uuid`), not a
  parent. A shim for a parent (a jayson client) will not stop a deeper `uuid@14`
  from being evaluated. Knip-ignore the shim.

### After the fix — clean up

Once a source/mock/shim fix lands, **remove the now-redundant `deps.inline` /
`ssr.noExternal` entries** for that chain. Leftover inline entries are dead
whack-a-mole that mask regressions — and finding them is a tell that a prior
attempt went down the wrong path. Don't flip `pool` to "test a hypothesis"
either: it may already be pinned for an unrelated reason (jsdom
`window.location` under Vitest 4) — check the config comment first.

## Mechanism C — turbo cache / env-in-inputs

A check passes locally but fails in CI (or vice-versa). Often turbo served a
**cached** result, or a `.env*` change invalidated `build`/`type-check`/`test`
caches (they're listed in those tasks' `inputs`).

**Fix:** `pnpm turbo run <task> --force` to bypass the cache while diagnosing.
Don't edit `.env` just to flip a runtime value — override via `process.env` at
run time. CI (Node 24) is authoritative.

## General methodology

1. **Reproduce the single failing unit in isolation** (one file / one package),
   not the whole suite.
2. **Classify: config knob or source problem?** Config knobs only affect modules
   the tool *transforms*; externalized deps bypass them. If `vite build` passes
   but the runner crashes, it's a runner-externalization issue, not your code.
3. **Trace from the crashing leaf upward** to the first eager evaluation.
4. **Decide:** root-fix (edit the pulling package) > boundary-mock > build-only
   shim. Avoid downgrades/pins that fight the ecosystem.
5. **Verify the prod build still works** — a lazy import must not break bundling.
6. **Push and read CI** (Node 24).

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "`vite build` passes, so the code is fine — it's just a vitest knob I'm missing." | Build ≠ test. The runner externalizes & `require()`s; build bundles statically. The knob won't reach an externalized transitive dep. |
| "The error names `uuid`, so handle `uuid` and the chain resolves." | The whole chain is ESM. Inline one and the crash moves up. Fix the eager import at the source. |
| "It's ESM-only → put it in `ssr.noExternal` / `deps.inline`." | No effect on a dep `require()`d inside an already-externalized package. |
| "It's probably a pool / worker isolation quirk — flip `pool`." | It's a module-format transform issue, not isolation. |
| "Pin `uuid` back to a CJS version via a pnpm override." | Fights the ecosystem and rots. Defer the import instead. |
| "TS2307 means my import path is wrong." | Usually stale `dist`. Run via turbo (`^build`) or rebuild the package first. |

## Don't

- Don't whack-a-mole each ESM dep into `inline`/`noExternal`.
- Don't rewrite a barrel import to a deep path to dodge the chain (violates the
  barrel-import convention; fragile).
- Don't treat a local pass as a CI pass — push and read the Node-24 log.
