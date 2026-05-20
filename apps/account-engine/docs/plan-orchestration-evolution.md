# Plan-orchestration: evolution guardrail

The architecture planes (Strategy / Intent / **plan-orchestration** /
Execution / Identity) and the one-line dependency rule are defined in the
root [../../../CLAUDE.md](../../../CLAUDE.md#architecture-planes).

This file holds the **multi-step evolution guardrail** for the
plan-orchestration plane specifically — roadmap-shaped content that does not
belong in the constraints layer. It is a guardrail, not a scheduled project.

## 1. Now: deposit-plan is a dead proxy

The current `deposit-plan` lives in account-engine and is a dead proxy.
Do not extend it.

## 2. When analytics→deposit is wired

Replace the dead proxy with **one** bounded
`apps/account-engine/src/modules/plan-orchestration/` module that:

- Owns the `POST /plan-orchestration/*` routes.
- Owns its `@zapengine/types` contract.
- Has no imports to / from the rest of account-engine.

This is the only intent / orchestration code permitted inside account-engine.

## 3. Extract to `apps/plan-orchestration`

Extract when any of these triggers fires:

1. account-engine's runtime coupling to analytics-engine for a money route
   causes incidents.
2. LiFi / RPC key exposure on the client becomes a concern.
3. account-engine deploy coupling starts costing you.

Until a trigger fires, do not pre-extract — the module-inside-account-engine
shape is deliberate.
