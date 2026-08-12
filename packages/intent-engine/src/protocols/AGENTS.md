See @../../AGENTS.md and the package [README](../../README.md).

# Protocol adapters

Protocol adapters are pure intent-engine integration modules. They expose protocol metadata/constants and encode an already-decided action; they do not decide strategy, load user state, or perform network I/O.

## Boundaries

- Zero analytics/strategy knowledge and zero identity/persistence knowledge.
- Keep provider addresses/capabilities in constants/registry data keyed by `ChainId`; do not fetch them dynamically from protocol adapters.
- Standard on-chain encoders are pure calldata builders. Transaction composition belongs in builders, not protocols.
- Hyperliquid is intentionally different: its adapter emits declarative `DepositFollowUp` data because execution-time nonce/signature work belongs in the execution plane. Do not force it into fake calldata just to match other adapters.
- Protocol adapters may depend only on the package's allowed low-level dependencies (`@zapengine/types`, viem/encoding utilities); never import upward from builders, strategies, apps, analytics, or persistence layers.

## Adding/changing an adapter

- Follow the existing `<protocol>.constants.ts` / `<protocol>.encoder.ts` / `index.ts` shape when it fits; do not create abstraction solely to make all protocols look identical.
- Register stable protocol ids in `registry.ts`. Treat an existing protocol id as an external contract; rename only as an explicit breaking-contract change.
- Add focused encoder/descriptor tests against known-good fixtures or protocol behavior.
- Add a package subpath export only when external consumers need direct access; otherwise keep the adapter behind the intent-engine public surface.
