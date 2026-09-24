# Cost observability

Vendor and infrastructure cost collectors behind the control-center ledger.
Each provider answers one question — "what did this cost us this month?" —
as a `CostSnapshot`; pricing, timing, and error semantics live in shared
helpers so providers stay thin.

## Layout

- `src/providers/<name>.ts` — one file per provider, each exporting a single
  `fetch<Name>CostSnapshot(input)` entry point (`brave`, `cloudflare`,
  `debank`, `openrouter`, `fixed`). Shared parsing/math lives in
  `src/providers/numbers.ts`; UTC period helpers in `src/time.ts`.
- `src/providers/http.ts` — `fetchWithRetry` is the one retrying GET every
  HTTP collector uses: three attempts, exponential backoff, a fresh timeout
  per attempt. Its `label` becomes the prefix of every message it can throw,
  and control-center's `safeProviderError` only passes a provider message
  through verbatim when it recognises that prefix — so a new collector's
  label has to be added there too, or its real failures reach the operator as
  "Provider request failed".
- `src/pricing.ts` — `resolvePricingRate` matches a ledger `ops.cost_rates`
  row by provider + metric key + date. A metered provider with usage but no
  rate reports "USD cost unknown", never zero.
- `src/errors.ts` — `UsageNotMeasurableError` is the whole "answered but
  unmeasurable" vocabulary: the vendor stopped publishing the quantity, so
  retrying cannot help and no operator action exists. Throw it (with an
  authored, verbatim-safe message) instead of a bare `Error` whenever the
  response structurally carries no measurable quota. Anything else —
  transport, auth, unparseable data — stays a plain `Error`.
- `src/index.ts` is the public surface; `src/types.ts` owns `CostSnapshot`,
  `CostType`, and the `COST_PROVIDERS` roster.

## Consumed by control-center

`apps/control-center/src/server/services/costs.ts` calls each collector and
maps the outcome to `ok` / `error` / `unconfigured`:
`UsageNotMeasurableError` becomes `unconfigured` ("collected nothing, nothing
to fix"), which `cost-sync.ts` files as `skipped` so the nightly `ops:sync`
cron stays green. A plain `Error` becomes `error` and fails the cron via
`sync.ts`'s exit-1 path — so only throw it when something is actually broken.
Cost numbers must never be fabricated: unknown is `null`, never `0`.

## Testing

`src/providers/providers.test.ts` pins collectors against captured
header/payload fixtures (see the Brave zero-limit case). When Brave changes
its rate-limit headers, update the fixture and the narrow
measurable-vs-broken boundary beside it — do not widen
`UsageNotMeasurableError` to cover malformed data.

Cloudflare is pinned against `CLOUDFLARE_R2_ROWS` in
`src/providers/test-helpers.ts`, shaped from a redacted live capture of the v1
`GET /accounts/{id}/billable-usage` response (2026-09-24): identifiers are
placeholders and quantities are invented, but the field set is real. That
capture confirmed that `EffectiveCost`, `ContractedCost` and `ListCost` are all
populated mid-period. The v2 `billable/usage` endpoint is a restricted alpha
that answers 403 (code 1171) even to a Billing Read token, so do not switch
back to it until Cloudflare enables it for the account.
