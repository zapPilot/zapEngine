See @../AGENTS.md for the shared ETL module rules.

# Hyperliquid pipeline

This pipeline reads Hyperliquid vault data, normalizes user vault positions, and persists vault APR snapshots. It is not the perpetual-funding pipeline described by older docs.

## Invariants

- Keep fetch/transform/write responsibilities separated across `fetcher.ts`, `transformer.ts`, `aprWriter.ts`, and `processor.ts`.
- Preserve raw Hyperliquid vault identity by vault address; APR writes are keyed by vault address plus snapshot time.
- Invalid/non-finite APR values must fail transformation rather than being silently clamped or replaced.
- Hyperliquid timestamps and API values are source data; do not apply local-time reinterpretation before persistence.
- Keep provider I/O in the fetcher. Transformers and writers must not start making direct Hyperliquid API calls.
- Respect the shared Hyperliquid rate limiting from the ETL infrastructure.
