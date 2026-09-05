# Track-record snapshot runbook

The daily workflow is implemented by `.github/workflows/track-record-snapshot.yml`.

## Companion: rolling backtest refresh

The track-record page defaults to the committed backtest dataset. Live IPFS snapshots are a separate, explicit opt-in source selected by the reader; publishing a live snapshot does not retire or replace the default backtest view. A second daily workflow, `.github/workflows/backtest-refresh.yml`, keeps that backtest window current: it re-runs `sweep_production_window.py --update-snapshot --in-process` with `--reference-date` set to UTC yesterday, syncs `apps/landing-page/src/data/strategy-snapshot.json` via `pnpm lint snapshot-sync --fix`, checks the regenerated equity curve actually reaches the requested date (stale upstream ETL data aborts the run instead of publishing a flat tail), and commits the three artifacts. The push triggers the landing-page redeploy.

PR CI stays meaningful under this rolling scheme because the snapshot drift gate (`test:strategy-snapshot:fast`) reads `reference_date` from the committed fixture rather than the wall clock — it verifies the fixture is reproducible at its own date, while only the refresh workflow advances that date. The refresh workflow remains useful even while live snapshots are available because Backtest is still the default track-record source and the homepage backtest-proof section also consumes these artifacts.

## Flow

```text
read previous CID from track-record-meta.json
→ generate snapshot from configured wallets, tokens, RPCs, and LI.FI spot prices
→ optionally sign with the official EOA
→ pin JSON to Pinata
→ update track-record-meta.json
→ verify the published chain
→ commit the meta change
→ rebase onto the latest branch tip and push fast-forward only (3 attempts)
```

## Commands

```bash
pnpm track-record:generate -- --out .track-record/daily-snapshot.json
pnpm track-record:publish -- --snapshot .track-record/daily-snapshot.json
TRACK_RECORD_META_URL=file://$PWD/apps/landing-page/public/track-record-meta.json pnpm track-record:verify
```

## Configuration

Required or commonly used variables:

- `TRACK_RECORD_RPC_URLS` as a JSON object keyed by chain ID; the snapshot's
  sorted `chainIds` list is derived from these keys
- `TRACK_RECORD_WALLET_ADDRESSES`
- `TRACK_RECORD_TOKENS_JSON`
- `TRACK_RECORD_PRICE_ORACLE_JSON` only when an explicit deterministic price
  override is needed for backfills/tests; normal daily runs fetch spot USD
  prices from LI.FI using each token's chain ID and address
- `TRACK_RECORD_IPFS_PINATA_TOKEN`
- `TRACK_RECORD_SIGNER_PRIVATE_KEY` for signed snapshots

Every token in `TRACK_RECORD_TOKENS_JSON` must reference a chain configured in
`TRACK_RECORD_RPC_URLS`. The generator reads balances, fetches spot prices from
the existing LI.FI token-pricing adapter, computes NAV/performance, links
`previousCid`, validates with `DailySnapshotSchema`, and signs when a private
key is present. `TRACK_RECORD_PRICE_ORACLE_JSON` takes precedence when supplied,
so deterministic fixtures/backfills do not depend on live prices. The publisher
pins the validated snapshot and updates
`apps/landing-page/public/track-record-meta.json`. The verifier checks schema,
CID linkage, signature, signer, and performance calculations.

## Failure handling

The workflow stops on command failure and does not commit a failed run. The only retry in the pipeline is the final push, which is shared with the other cron workflows that publish generated artifacts through `.github/actions/commit-generated-artifacts`: it fetches the latest branch tip, rebases the generated commit onto it (`--autostash`), and pushes fast-forward only, retrying up to 3 times when the branch advances during the run. A concurrent change to `track-record-meta.json` that conflicts during rebase fails the job instead of being overwritten. The generate/publish/verify scripts themselves still rely on request timeouts and normal command failure and do **not** implement a three-attempt retry policy or a separate KV store.

## Not implemented here

Rebalance-event discovery, separate rebalance-log production, weekly on-chain anchoring, Arweave backup, and zk proofs are not part of the current pipeline. Track desired work in GitHub Issues rather than adding unchecked tasks to this runbook.
