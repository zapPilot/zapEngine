---
name: app-playwright-ci-debugging
description: >-
  Use when `apps/app` Playwright e2e tests fail in CI or local runs, especially
  Expo web export startup, `PLAYWRIGHT_PORT` / `BASE_URL` mismatch, route-smoke
  assertions, ErrorBoundary smoke checks, or old frontend/mobile-v2 path drift.
---

# App Playwright CI debugging

## Core principle

**Test the current Expo web app shell on the same port CI uses; do not resurrect
retired frontend paths or weaken the e2e gate to hide slow startup.**

`apps/app` is the current Expo web app. Retired `apps/frontend` and
`apps/mobile-v2` paths should not be reintroduced when fixing old Playwright notes.

## Where the signal already is

Playwright failures usually surface under the core CI verify loop. Start from the
named failing spec or the `.ai-verify/logs/` file produced by `pnpm verify ci` /
`pnpm verify changed`.

Useful narrow commands:

```bash
cd apps/app && pnpm run build:web
cd apps/app && PLAYWRIGHT_PORT=3100 pnpm exec playwright test tests/e2e/smoke.spec.ts
cd apps/app && PLAYWRIGHT_PORT=3100 pnpm run test:e2e
```

## Port and web-server rules

Keep the e2e script and Playwright web server in sync:

- If `test:e2e` builds the Expo web export first, `webServer.command` should serve
  the existing export rather than rebuild it.
- The server must bind to the same `PLAYWRIGHT_PORT` used to derive `BASE_URL`.
- Avoid hard-coded ports in one side of the setup.
- Expo web export and static-server startup can be slow in CI. Prefer a
  conservative Playwright `webServer.timeout` over skipping or deleting the gate.

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

## Fix workflow

1. Read the named Playwright spec/log first.
2. Reproduce one spec with `PLAYWRIGHT_PORT=3100`.
3. If startup times out, verify `build:web`, `webServer.command`, port, and
   timeout before touching assertions.
4. If assertions fail, replace mutable copy checks with stable route/shell/error
   checks.
5. Run the app e2e command, then return to **monorepo-ci-debugging** for widened
   verification if root/shared files changed.

## Rationalizations — STOP

| Excuse | Reality |
| --- | --- |
| "The old frontend path is where e2e used to live." | `apps/app` is the current Expo web app. Do not revive retired paths. |
| "Startup is flaky, so skip the e2e gate." | Fix port/web-server/timeout parity. |
| "A balance or APR string proves the page loaded." | Route smoke should not depend on mutable product copy or market data. |
| "The app built locally, so Playwright port config is fine." | Build success does not prove `PLAYWRIGHT_PORT` / `BASE_URL` parity. |

## Verification

```bash
cd apps/app && pnpm run build:web
cd apps/app && PLAYWRIGHT_PORT=3100 pnpm run test:e2e
```

If the PR changes root config, shared packages, env, or CI wiring, also follow
**monorepo-ci-debugging** before handoff.
