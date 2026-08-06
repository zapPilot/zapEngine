# Architecture planes

ZapEngine separates strategy, intent construction, orchestration, execution, and identity so no layer quietly takes over another layer's responsibilities.

| Plane or layer | Responsibility | Current home |
| --- | --- | --- |
| Strategy | Decide what allocation should be produced; never build transactions | `apps/analytics-engine` |
| Intent and routing | Convert a normalized intent into `PreparedTransaction[]`; remain pure | `packages/intent-engine` |
| Plan orchestration | Compose strategy output, normalized intent, and execution plans | `apps/account-engine` plan-orchestration module |
| Execution | Confirm, sign, and broadcast prepared transactions | App clients and wallet |
| Identity and persistence | Identify users and persist state; never own money-movement planning | `apps/account-engine` |

## Dependency direction

- The intent core depends only on shared contract types and protocol adapters.
- Plan orchestration may compose strategy output and intent construction downward.
- Analytics does not know about execution details.
- Identity and persistence code does not construct transaction plans.
- Clients do not independently recompute an authoritative server plan.

## One authoritative path

Every money-moving flow has one authoritative planning path. Do not compute the same plan independently in both client and server code against a shared contract.

## Evolution

The current extraction state and triggers for moving plan orchestration into its own app are documented in [apps/account-engine/docs/plan-orchestration-evolution.md](../../apps/account-engine/docs/plan-orchestration-evolution.md). Keep transitional state there rather than duplicating it in this durable architecture description.
