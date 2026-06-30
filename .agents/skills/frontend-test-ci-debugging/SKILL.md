---
name: frontend-test-ci-debugging
description: >-
  Use when @zapengine/frontend test:ci or test:coverage fails in CI — especially
  a Vitest/jsdom module-load crash ("Unexpected token 'export'", "seems to be an
  ES Module but shipped in a CommonJS package") from a transitive node_modules
  dep (jayson, uuid, @solana/web3.js, @lifi/sdk), a "[coverage] Batch N/… could
  not be split further" hard-fail, or "Found multiple elements" batch failures —
  and tweaking vite.config resolve.alias / server.deps.inline / ssr.noExternal /
  pool does not fix it. Do not use for local Vite dev-server/browser-cache
  failures such as 504 "Outdated Optimize Dep" from /node_modules/.vite/deps/.
---

# Frontend test:ci / coverage debugging

This skill is only for frontend Vitest / coverage / `test:ci` failures. For
local Vite dev-server failures such as
`/node_modules/.vite/deps/... 504 (Outdated Optimize Dep)`, inspect the running
dev server and browser cache state instead; do not apply this skill's Vitest
externalization guidance.

## Where the error already is

Don't re-discover the failure — start from the GitHub job log or a completed
local verify result. `verify changed` writes an aggregate entry to
`.ai-verify/result.json` and `.ai-verify/logs/verify-changed.log`; full-gate
variants write per-job logs under `.ai-verify/logs/`. Find the failed job, then
read its log:

- a frontend Vitest crash surfaces in the **`test`** job at
  `.ai-verify/logs/test.log`; the
  `[coverage] Batch N/… could not be split further` line names the real file

That log holds the full error. The narrower `vitest run … <file>` command below
is for isolating that one file — not the entry point. (The standalone `coverage`
CI job is separate; see [monorepo-coverage-gate](../monorepo-coverage-gate/SKILL.md).)

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

> **`test:ci` = `test:coverage` (~109 serial vitest+coverage batches, ~8–9 min) `&&`
> `test:e2e` (Playwright real-browser suite, ~10 min).** It is `cache:false`, so it
> re-runs in full every time. Under `pnpm verify parallel` all of that output goes to
> `.ai-verify/logs/test.log` (silent console) — so a 20–30 min "hang after `[lint] passed`"
> is almost always just this slow job, **not** a deadlock. **Requires Node 24**: on a newer
> major, coverage-v8 throws intermittent `ENOENT`/`Unhandled Error` reading its temp files,
> triggering batch-retry storms that make `test:coverage` appear to never finish. Confirm
> `node -v` = 24 before debugging further. For the inner loop use `test:unit` (~3 min) or a
> single `vitest run --coverage <file>`, not `test:ci`.

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

## ESM-only transitive dep crash — frontend-specific routing

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

Use
[monorepo-build-import-errors](../monorepo-build-import-errors/SKILL.md)
for the authoritative mechanism trace, root-fix versus boundary-mock decision,
canonical lazy-import example, and cleanup of obsolete config workarounds.

Keep only these frontend-specific constraints in mind:

- A test that calls `importActual` / `importOriginal` forces the real package
  chain to load, so a boundary `vi.mock` cannot solve it; use the source-level
  root fix described in the build/import skill.
- If the package is not editable and tests do not force the real module, mock
  the first package boundary imported by frontend-controlled code.
- After the source/mock fix, rerun the named file with coverage and build the
  frontend production bundle. Test-runner success alone does not prove a lazy
  import still bundles correctly.

## Common mistakes / red herrings

| Belief                                                           | Reality                                                                                                         |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| "CI's eslint/prettier rewrote my file, so it keeps failing"      | CI runs `eslint .` / `prettier --check` — **read-only**. File mutation is not the cause.                        |
| "Passes alone, fails in a batch → the runner is broken"          | That's pollution; the sharded runner bisects it. Not a blocker.                                                 |
| "Add the dep to `server.deps.inline` / alias / `ssr.noExternal`" | No effect on externalized transitive deps. Build-only knobs.                                                    |
| "Flip `pool` / rewrite the barrel import to a deep path"         | Config-level dodging; fragile, and the deep-path rewrite violates the barrel-import convention. Fix the source. |
| "It fails on my Node, must be a local artifact"                  | Maybe — but verify on CI (Node 24). Some local failures are real on CI too.                                     |

## Verification

- Reproduce the named file alone → crash gone.
- Edited a package? `pnpm turbo run test type-check lint --filter=@zapengine/<pkg>`
  and `pnpm --filter @zapengine/frontend run build` (lazy import must not break the
  prod bundle).
- Push and read CI (Node 24). Expect the cascade to advance to the next hard-fail
  if one exists — fix iteratively.
