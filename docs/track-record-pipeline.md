# Track-record snapshot runbook

The daily workflow is implemented by `.github/workflows/track-record-snapshot.yml`.

## Flow

```text
read previous CID from track-record-meta.json
→ generate snapshot from configured wallets, tokens, RPCs, and prices
→ optionally sign with the official EOA
→ pin JSON to Pinata
→ update track-record-meta.json
→ verify the published chain
→ commit and push the meta change
```

## Commands

```bash
pnpm track-record:generate -- --out .track-record/daily-snapshot.json
pnpm track-record:publish -- --snapshot .track-record/daily-snapshot.json
TRACK_RECORD_META_URL=file://$PWD/apps/landing-page/public/track-record-meta.json pnpm track-record:verify
```

## Configuration

Required or commonly used variables:

- `TRACK_RECORD_CHAIN_IDS`
- `TRACK_RECORD_RPC_URLS`
- `TRACK_RECORD_WALLET_ADDRESSES`
- `TRACK_RECORD_TOKENS_JSON`
- `TRACK_RECORD_PRICE_ORACLE_URL` or `TRACK_RECORD_PRICE_ORACLE_JSON`
- `TRACK_RECORD_IPFS_PINATA_TOKEN`
- `TRACK_RECORD_SIGNER_PRIVATE_KEY` for signed snapshots

The generator reads balances, applies configured prices, computes NAV/performance, links `previousCid`, validates with `DailySnapshotSchema`, and signs when a private key is present. The publisher pins the validated snapshot and updates `apps/landing-page/public/track-record-meta.json`. The verifier checks schema, CID linkage, signature, signer, and performance calculations.

## Failure handling

The workflow stops on command failure and does not commit a failed run. The scripts currently rely on request timeouts and normal command failure; they do **not** implement the previously documented three-attempt retry policy or a separate KV store.

## Not implemented here

Rebalance-event discovery, separate rebalance-log production, weekly on-chain anchoring, Arweave backup, and zk proofs are not part of the current pipeline. Track desired work in GitHub Issues rather than adding unchecked tasks to this runbook.
