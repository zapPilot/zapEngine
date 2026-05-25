See @../../../CLAUDE.md and the package [README](../../README.md).

# protocols

Protocol adapters for DeFi integrations consumed by intent-engine builders. Each adapter is a small, self-contained module exposing constants (addresses, ABI fragments, gas estimates) and encoders (build calldata for a given action).

## Layout

```
protocols/
├── index.ts          # Barrel — re-exports public surface
├── registry.ts       # Protocol registry (id → metadata) used by routing
├── morpho/           # Morpho vaults — supply/withdraw on ERC-4626 vaults
│   ├── index.ts
│   ├── morpho.constants.ts   # Addresses, ABI, gas estimates, vault catalog
│   └── morpho.encoder.ts     # Calldata encoders (supply, redeem)
└── gmx-v2/           # GMX v2 GM-markets — supply (mint GM tokens)
    ├── index.ts
    ├── gmx-v2.constants.ts
    └── gmx-v2.encoder.ts
```

## Adding a new protocol adapter

1. Create `protocols/<name>/` with the three files: `index.ts`, `<name>.constants.ts`, `<name>.encoder.ts`.
2. **Constants**: addresses keyed by `ChainId`, ABI fragments, gas estimates. Use the Zod schemas from `@zapengine/intent-engine/types` for vault catalog / capability shape so the registry can ingest it.
3. **Encoder**: pure functions `buildXxxCalldata(args): Hex`. No I/O. No simulation. Just encode.
4. **Register**: add an entry in `registry.ts` with the protocol id and metadata.
5. **Expose**: add a subpath export in the root `package.json` if consumers should import it via `@zapengine/intent-engine/<name>` (see existing morpho / gmx-v2 paths).
6. **Test**: colocated `*.test.ts` covering each encoder against a known-good calldata fixture.

## Conventions

- **Zero analytics knowledge**: protocols don't compute "is this a good idea". They only know how to encode an action once routing has decided.
- **Zero identity knowledge**: no user lookup, no persistence.
- **Dependencies allowed**: `@zapengine/types`, `viem` for encoding, that's it.
- Addresses and gas estimates are constants — never fetched at runtime from here.
- Encoders return `Hex` (viem type). Composing into a `PreparedTransaction` happens in `builders/`, not here.

## Gotchas

- Protocol addresses differ per chain — the constants must key by `ChainId` even when the adapter only supports one chain today.
- Don't import `builders/` or `strategies/` from a protocol adapter — that's the wrong direction.
- Renaming a protocol id breaks the registry consumers downstream. Treat the id like a public API.
