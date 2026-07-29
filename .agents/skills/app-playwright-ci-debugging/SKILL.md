---
name: app-playwright-ci-debugging
description: >-
  Use when `apps/app` Playwright e2e tests fail in CI or local runs, especially
  Expo web export startup, `PLAYWRIGHT_PORT` / `PLAYWRIGHT_BASE_URL` mismatch,
  route-smoke assertions, a `Privy config is missing` screen, Metro env-cache
  poisoning, auth navigation drift, ErrorBoundary smoke checks, or old
  frontend/mobile-v2 path drift.
---

# App Playwright CI debugging

## Core principle

**Test the current Expo web app shell on the same port CI uses; do not add tests
or product code to the frontend build shim, resurrect mobile-v2, or weaken the
e2e gate to hide slow startup.**

`apps/mobile-v2` is retired. `apps/frontend` remains only as a build shim that
delegates export to `apps/app`; do not add tests or product code to it.

## Where the signal already is

Playwright failures usually surface under the core CI verify loop. Start from the
named failing spec or the `.ai-verify/logs/` file produced by `pnpm verify ci` /
`pnpm verify changed`.

Useful narrow commands:

```bash
cd apps/app && pnpm run test:e2e
cd apps/app && PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/smoke.spec.ts
```

Run `test:e2e` once before the raw Playwright command so the checked, E2E-specific
export exists.

## Port and web-server rules

Keep the e2e script and Playwright web server in sync:

- If `test:e2e` builds the Expo web export first, `webServer.command` should serve
  the existing export rather than rebuild it.
- The server must bind to `PLAYWRIGHT_PORT`, and `PLAYWRIGHT_BASE_URL` must point
  to that server.
- Avoid hard-coded ports in one side of the setup.
- Expo web export and static-server startup can be slow in CI. Prefer a
  conservative Playwright `webServer.timeout` over skipping or deleting the gate.

## Expo env and Metro cache rules

`EXPO_PUBLIC_*` values are compiled into the static web export. Environment
variables on Playwright's static `webServer` process cannot repair a bundle that
was built without them.

The root build can export `apps/app` through the `apps/frontend` compatibility
shim before E2E runs. That env-less export warms Metro's transform cache. A later
export with E2E Privy placeholders can reuse the stale transforms unless its
bundler cache is cleared.

- Build E2E only through `apps/app/scripts/build-e2e-web.mjs`.
- Keep Expo's `--clear` flag and the compiled-placeholder verification together.
- Treat a fast rebuild after an earlier env-less export as evidence to inspect
  the bundle, not proof that the new env was compiled.
- Do not move build-time env into `playwright.config.ts`; its web server only
  serves `dist/web`.

## App boot and hydration failures

When both the root redirect and a direct route fail before any app control is
visible, treat them as one app-boot failure rather than two locator bugs.

- Read each failure's `error-context.md` before changing timeouts or locators. If
  its DOM contains `Privy config is missing`, fix the compiled export; routing
  and later media assertions have not run.
- If the artifact has no text log, use `error-context.md`, screenshots, and the
  Playwright trace together; the config screen proves compiled config is absent,
  while the preceding build log and export duration confirm the cache mechanism.
- Compare adjacent CI runs before changing product routing. A later pass with no
  relevant app diff is evidence against a route contract change, but it can be
  an env-sensitive cache hit rather than generic runner timing. Compare export
  durations and verify compiled config before classifying hydration as flaky.
- Use a dedicated boot timeout for the first stable shell/control; keep normal
  interaction assertions strict after the app is visible.
- Retain Playwright traces and failure screenshots in CI, and upload
  `apps/app/playwright-report` plus `apps/app/test-results` on failure.
- Do not add `window` fallbacks to shared Expo route files. Shared routes also run
  on native, and browser navigation still cannot help when React never mounts.

## Route-smoke assertion rules

For route-smoke specs, avoid mutable product-copy assertions such as balances,
marketing labels, `$`, or `%`.

Prefer stable checks:

- route URL is correct;
- a stable app shell/root is visible;
- app ErrorBoundary text is absent;
- not-found text is absent when the route should exist.

This keeps smoke tests focused on routing and app health instead of copy or market
data.

## Auth navigation alignment

When touching `BottomTabBar`, `AuthenticatedRoute`, `nativePrivyLogin`, or app tab
route constants, update implementation and `tests/e2e/smoke.spec.ts` together.

Before merging, choose and verify exactly one locked-tab behavior:

- guest stays on the current route and the connect flow opens; or
- guest navigates to the locked route and sees the sign-in gate.

Do not merge a PR where `BottomTabBar` implements one behavior while the smoke
spec asserts the other. A PR body saying “new CI will validate” is not enough;
wait for the final GitHub Actions run on the PR head to pass.

## Fix workflow

1. Read the named Playwright log and artifact `error-context.md` first.
2. If multiple tests stop before the first app control, classify one shared boot
   failure instead of editing each test.
3. For `Privy config is missing`, inspect whether an env-less web export ran
   earlier, then run `pnpm run test:e2e`; do not touch routing or later assertions.
4. For another startup timeout, verify `webServer.command`, port, config screen,
   browser console, and page errors before increasing timeouts.
5. If post-boot assertions fail, replace mutable copy checks with stable
   route/shell/error checks.
6. For auth-tab failures, compare the `BottomTabBar` inaccessible-tab branch with
   the locked-tab step in `tests/e2e/smoke.spec.ts` before changing either side.
7. Run the app e2e command, then return to **monorepo-ci-debugging** for widened
   verification if root/shared files changed.

## Rationalizations — STOP

| Excuse                                                            | Reality                                                                        |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| "The old frontend path is where e2e used to live."                | `apps/app` owns e2e; `apps/frontend` is only an export build shim.             |
| "Startup is flaky, so skip the e2e gate."                         | Preserve the gate; add boot-specific waiting and failure artifacts.            |
| "A balance or APR string proves the page loaded."                 | Route smoke should not depend on mutable product copy or market data.          |
| "The app built locally, so Playwright port config is fine."       | Build success does not prove `PLAYWRIGHT_PORT` / `PLAYWRIGHT_BASE_URL` parity. |
| "The implementation fix is obvious; CI can validate after merge." | Route-smoke expectations must match the auth navigation model before merge.    |
| "A browser redirect fallback will fix CI hydration."              | It only runs after React mounts and is unsafe in a shared native route.        |
| "The Playwright web server has the env, so the app does too."     | Static Expo config was compiled earlier; serving env cannot rewrite it.        |
| "Reorder the later video assertions to fix both failed tests."    | If both tests show the config screen, neither reached the video assertions.    |
| "Drop `--clear` because a warm Metro build is faster."            | Env-less transforms can silently restore the config screen in E2E.             |

## Verification

```bash
cd apps/app && pnpm run test:e2e
```

If the PR changes root config, shared packages, env, or CI wiring, also follow
**monorepo-ci-debugging** before handoff.
