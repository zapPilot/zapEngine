---
name: app-playwright-ci-debugging
description: >-
  Use when `apps/app` Playwright e2e fails, especially Expo web export startup,
  Privy config screens, Metro env-cache poisoning, port/base-URL mismatch, route
  smoke drift, or auth navigation mismatch.
---

# App Playwright CI debugging

## Core rule

`apps/app` owns the Expo web app, its Vercel build, and Playwright tests. Do not
resurrect retired mobile paths or add a second deployment shim.

Start with the named Playwright log plus `error-context.md` / trace before
changing app code or timeouts.

## Narrow commands

```bash
cd apps/app && pnpm run test:e2e
cd apps/app && PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/smoke.spec.ts
```

Run `test:e2e` before raw Playwright so the checked E2E export exists.

## Expo export, env, and Metro cache

`EXPO_PUBLIC_*` is compiled into the static Expo bundle. Env on Playwright's
static web-server process cannot repair a bundle built without it.

An earlier env-less export can warm Metro with transforms that the later E2E
export then reuses.

- Build E2E only through `apps/app/scripts/build-e2e-web.mjs`.
- Keep Expo `--clear` and compiled-placeholder verification together.
- A suspiciously fast rebuild after an env-less export is a reason to inspect the
  bundle, not proof that the E2E env was compiled.
- Keep `PLAYWRIGHT_PORT`, `PLAYWRIGHT_BASE_URL`, and `webServer.command` aligned;
  serve the existing E2E export rather than rebuilding it in `webServer.command`.

## Boot failure classification

When multiple tests fail before the first stable app control, treat them as one
boot failure rather than independent locator failures.

- `Privy config is missing` in `error-context.md` means the compiled export is
  wrong; routing and later assertions have not run.
- Use `error-context.md`, screenshots, traces, browser console, and page errors
  before increasing startup timeouts.
- Compare adjacent CI runs and export durations before calling hydration flaky.
- A dedicated first-boot timeout is fine; keep post-boot interactions strict.
- Preserve CI uploads of `apps/app/playwright-report` and `apps/app/test-results`.
- Do not add browser-only `window` recovery to shared Expo route files.

## Route and auth smoke rules

Route smoke should assert stable app health, not mutable product data:

- expected URL / route;
- stable shell or root control;
- no ErrorBoundary text;
- no not-found state for a valid route.

When changing `BottomTabBar`, `AuthenticatedRoute`, `nativePrivyLogin`, or tab
route constants, update `tests/e2e/smoke.spec.ts` in the same change. Pick one
locked-tab behavior and make implementation and test agree: either stay on the
current route while connect opens, or navigate to the locked route and show its
sign-in gate.

## Fix workflow

1. Read the failing Playwright log and `error-context.md`.
2. If several tests stop before app boot, diagnose the shared boot/export issue.
3. For missing Privy config, inspect prior env-less exports and rerun
   `pnpm run test:e2e`; do not edit later route/media assertions.
4. For other startup failures, verify server command, port/base URL, config
   screen, console, and page errors before changing timeouts.
5. For post-boot smoke failures, prefer stable route/shell/error assertions over
   balances, APR, marketing copy, `$`, or `%`.
6. For auth-tab failures, compare the inaccessible-tab implementation and smoke
   expectation directly.
7. Run `cd apps/app && pnpm run test:e2e`, then return to
   **monorepo-ci-debugging** if root/shared files changed.

## Verification

```bash
cd apps/app && pnpm run test:e2e
```

If the change touches root config, shared packages, env, or CI wiring, widen via
**monorepo-ci-debugging** before handoff.
