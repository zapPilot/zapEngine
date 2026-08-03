# EIP-7702 policy delegation decision

Date: 2026-07-07

## Decision

Do not rely on Ambire or OKX delegates as-shipped for unattended, policy-bounded sessions.

The required policy floor is:

- allowed target and method constraints
- native and ERC-20 spend limits
- expiry
- user revocation
- on-chain enforcement independent of the Zap Pilot backend

Ambire exposes revocable keys but did not ship the required scoped-session policy. OKX exposes hooks that can inspect calls, but Zap Pilot would need to build and audit the policy hook. MetaMask Delegation Framework was the best existing candidate because its caveat enforcers cover target, method, value/token limits, time, and revocation.

## Consequences

- Ambire and OKX may remain supported wallet/delegation implementations for user-approved execution; that is separate from satisfying the unattended-session policy floor.
- Do not describe ordinary EIP-7702 delegation as a scoped session key.
- Prototype and audit review are required before enabling policy-bounded automation.
- A custom OKX hook is a fallback only; it is custom Solidity and needs its own security review.

## Revalidate when

Re-run this research before implementation because vendor contracts, deployments, and audits can change. In particular, revalidate when:

- Ambire ships audited scoped session keys
- OKX ships an audited whitelist/spend-limit hook
- MetaMask changes framework version, deployments, or enforcer semantics
- supported chains or required token-limit semantics change

Historical source links and detailed vendor notes were intentionally removed from this repository document because they become stale. Capture fresh evidence in the implementation issue or security review.
