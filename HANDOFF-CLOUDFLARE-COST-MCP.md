# HANDOFF — Cloudflare cost + API/MCP integration

## Status
Investigation complete; no production implementation. Add Cloudflare to cost observability and agent access in a separate implementation PR.
Working tree: handoff-only branch; expected diff is this file only.

## Verified facts
- Top-level cost providers are only debank/openrouter/brave/supabase/fly; Cloudflare is absent. [verified: packages/cost-observability/src/types.ts:1-9]
- The collector registry has no Cloudflare source; all top-level snapshots flow through `collectCostProviders()`. [verified: apps/control-center/src/server/services/costs.ts:46-139]
- Nightly persistence is owned by `.github/workflows/ops-cost-sync.yml` and runs `pnpm ops:sync` through the merged prod env. [verified: .github/workflows/ops-cost-sync.yml:1-50]
- Cost-sync required credentials are explicitly checked; there are no Cloudflare credentials today. [verified: apps/control-center/src/server/config/env.ts:67-108]
- The env manifest has no Cloudflare billing/account credential for control-center. [verified: config/env.manifest.mjs:315-344]
- DB provider constraints currently allow Brave but not Cloudflare in rates/snapshots/transactions. [verified: supabase/migrations/20260904110000_add_brave_search_cost_observability.sql:7-27]
- `ops_costs` already returns normalized persisted provider rows from the shared costs domain; a persisted Cloudflare provider should appear there without a Cloudflare-specific MCP cost tool. [verified: apps/control-center/src/server/services/operations/costs.ts:22-60] [verified: apps/control-center/src/server/mcp/server.ts:190-200]
- Root MCP/OpenCode wiring exposes only `zap-pilot-ops`; coverage-review additionally wires Fly and Supabase, not Cloudflare. [verified: .mcp.json:1-8] [verified: opencode.json:1-11] [verified: .claude/mcp.coverage-review.json:1-17]
- Cloudflare exposes account billable usage at `GET /accounts/{account_id}/billable/usage`, including cost/usage records. [verified: web 2026-09-20 → Cloudflare Billing API documents the billable/usage endpoint and BilledCost/CumulatedContractedCost fields]
- R2 exposes storage and operations metrics through GraphQL datasets `r2StorageAdaptiveGroups` and `r2OperationsAdaptiveGroups`. [verified: web 2026-09-20 → Cloudflare R2 metrics docs]
- Cloudflare's recommended broad MCP endpoint is `https://mcp.cloudflare.com/mcp`; it supports OAuth or API-token auth. [verified: web 2026-09-20 → cloudflare/mcp README]

## Inventory
packages/cost-observability/src/types.ts:1-9  provider roster → implementation target
packages/cost-observability/src/providers/  vendor collectors → implementation target: add cloudflare collector/tests
apps/control-center/src/server/services/costs.ts:46-139  collector composition → implementation target
apps/control-center/src/server/config/env.ts:8-108  config + cost-sync credential gate → implementation target
config/env.manifest.mjs:315-344  env ownership/sensitivity → implementation target
.github/workflows/ops-cost-sync.yml:1-50  nightly collector → likely left alone if Infisical owns new secrets
supabase/migrations/20260904110000_add_brave_search_cost_observability.sql:7-27  provider constraints precedent → new migration required
apps/control-center/src/server/services/operations/costs.ts:22-60  ops cost read path → left alone unless normalized provider flow proves insufficient
.mcp.json / opencode.json / .claude/mcp.coverage-review.json  MCP client composition → implementation target for Cloudflare MCP where supported
apps/podcast-pipeline R2 S3 client/storage paths → left alone: object I/O is not billing SoT

## Tests
- No tests changed; handoff-only. mutation: not run
- Implementation should add collector payload/edge tests, provider-composition tests, env credential tests, migration constraint tests, and MCP config tests.

## Gates
- Repository executable gates → [not run] handoff-only; no local workspace used.
- Live Cloudflare billing endpoint against the production account → [not run] credentials unavailable through GitHub connector.

## Decisions
- Use Cloudflare Billing API as the cost SoT; do not calculate the headline bill from R2 GraphQL rate-card math when provider cost is available.
- Keep R2 GraphQL analytics as usage/reconciliation evidence (storage/operations), not the authoritative dollar figure.
- Add Cloudflare MCP as a sibling client connector beside `zap-pilot-ops`; do not proxy MCP-through-MCP inside the deterministic ops server.
- Keep deterministic `zap-pilot-ops` reads on normalized persisted data; direct vendor exploration belongs to the Cloudflare MCP/API connector.
- Prefer separate least-privilege credentials for nightly Billing Read and agent MCP access rather than reusing a broad agent token.

## Scope
Deliberately out: R2 lifecycle/GC changes, object upload behavior, retention policy, Workers deployment, write-capable Cloudflare automation.
Not reached: implementation, live billing payload capture, exact service-name filter for R2 rows, token provisioning, CI verification.

## Traps
- Do not treat current R2 bytes × public rate as an "actual" bill: R2 billing uses GB-month averaging, free tiers, operation classes and billable-unit rounding.
- Do not assume `BilledCost` is the correct in-progress accrued field; capture a live current-period response and pin the chosen field with a fixture before mapping it.
- Do not put Cloudflare provider secrets into browser/Vercel config; control-center documents provider credentials as server-side cost-sync inputs.

## Open questions
- Which current-period field from `/billable/usage` matches our `accruedCostUsd` semantics before invoice close: `BilledCost`, `CumulatedContractedCost`, or another field in the live payload?
- Which `ServiceName` / `ServiceFamilyName` values identify R2 in this account, and should Cloudflare snapshot include only R2 or all Cloudflare usage?
- What exact read scopes are minimally sufficient for billable usage plus optional R2 GraphQL analytics?
- Which repo MCP profiles support remote HTTP + token interpolation cleanly; should root `.mcp.json` use OAuth while unattended profiles use a dedicated token?
