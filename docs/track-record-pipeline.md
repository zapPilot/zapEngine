# Track Record Pipeline — Pipedream Contract

Daily snapshot pipeline that generates, signs, pins, and publishes the Zap Pilot public track record.

## Implemented entrypoints

Local / CI entrypoints:

```bash
pnpm track-record:generate -- --out .track-record/daily-snapshot.json
pnpm track-record:publish -- --snapshot .track-record/daily-snapshot.json
TRACK_RECORD_META_URL=file://$PWD/apps/landing-page/public/track-record-meta.json pnpm track-record:verify
```

GitHub Actions workflow:

- `.github/workflows/track-record-snapshot.yml`
- Schedule: `00:00 UTC` daily
- Sequence: generate snapshot → sign → pin to IPFS → update `track-record-meta.json` → verify → commit meta

## Architecture

```
GitHub Actions cron (daily; Pipedream/Cloud Run/Fly.io compatible later)
  └─> Read latestSnapshotCid from apps/landing-page/public/track-record-meta.json
  └─> Fetch on-chain balances + prices (RPC)
  └─> Generate DailySnapshot payload with previousCid = latestSnapshotCid
  └─> (Optionally) Sign payload with Zap Pilot official EOA
  └─> Pin signed snapshot JSON to IPFS  --> get new CID
  └─> Update apps/landing-page/public/track-record-meta.json
  └─> Commit the updated meta file
```

## Input / Configuration

| Var                               | Description                                                                                                 |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `TRACK_RECORD_PREVIOUS_CID`       | Previous snapshot CID. GitHub Actions reads this from `track-record-meta.json`.                             |
| `TRACK_RECORD_WALLET_ADDRESSES`   | Comma-separated wallet addresses to track.                                                                  |
| `TRACK_RECORD_CHAIN_IDS`          | Comma-separated numeric chain IDs, e.g. `1,42161`.                                                          |
| `TRACK_RECORD_RPC_URLS`           | JSON map keyed by chain ID, or comma-separated RPC endpoints index-aligned with `TRACK_RECORD_CHAIN_IDS`.   |
| `TRACK_RECORD_TOKENS_JSON`        | Optional tracked ERC-20/native token config. If absent, generator tracks native token per configured chain. |
| `TRACK_RECORD_PRICE_ORACLE_URL`   | Price feed endpoint.                                                                                        |
| `TRACK_RECORD_PRICE_ORACLE_JSON`  | Optional inline oracle payload for tests/manual runs.                                                       |
| `TRACK_RECORD_HISTORY_JSON`       | Optional inline NAV history. If absent, generator walks `TRACK_RECORD_PREVIOUS_CID` through IPFS.           |
| `TRACK_RECORD_IPFS_PINATA_TOKEN`  | Pinata JWT/API token for IPFS pinning.                                                                      |
| `TRACK_RECORD_SIGNER_PRIVATE_KEY` | Private key for EOA signing.                                                                                |

## Processing Steps

### 1. Fetch on-chain balances

For each `(chainId, walletAddress, rpcUrl)` triple:

- Call `eth_getBalance` for ETH holdings
- Call `eth_call` with ERC-20 `balanceOf` selectors for tracked tokens
- Aggregate into a position list

### 2. Fetch prices

Call the price oracle endpoint. Expected response shape:

```json
{ "prices": { "<token_address>": { "usd": "123.45" } } }
```

Use address `0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE` for native ETH.

### 3. Calculate NAV

For each position: `valueUsd = amount * priceUsd`

Sum all positions → `nav.usd`

Optionally compute `nav.eth` and `nav.btc` using oracle prices.

### 4. Calculate performance metrics

Requires reading the **previous** snapshot's `nav.usd`:

```
dailyReturn = (nav.usd - previousNavUsd) / previousNavUsd
```

Running cumulative return (from strategy start):

```
cumulativeReturn = (nav.usd / initialNavUsd) - 1
```

Max drawdown and volatility are recomputed from the last 30 days of NAV values (rolling window).

### 5. Set previousCid

`previousCid = KV_STORE:latestSnapshotCid`

### 6. Sign payload

Canonicalize the snapshot JSON (remove `signature` key, strip whitespace).

Hash with `keccak256`.

Sign with EIP-191: `personal_sign(hash, signerAddress)`.

Attach:

```json
{
  "signer": "0x...",
  "signedAt": "<ISO8601>",
  "messageHash": "<keccak256 hex>",
  "signature": "<r|s|v hex>"
}
```

Verification recovers the signer with EIP-191 semantics and compares it with
`track-record-meta.json.officialSigner`. Presence of signature fields alone is
not treated as valid.

### 7. Pin to IPFS

POST to Pinata `/pinning/pinJSONToAPI` with the snapshot payload.

Record returned `IpfsHash` as `newCid`.

### 8. Update public meta

`pnpm track-record:publish` writes `apps/landing-page/public/track-record-meta.json`
with the newly pinned CID.

### 9. Commit meta file to GitHub

```json
{
  "schemaVersion": "1",
  "strategyId": "dma_fgi_portfolio_rules",
  "strategyVersion": "v1",
  "latestSnapshotCid": "<newCid>",
  "updatedAt": "<ISO8601>",
  "officialSigner": "<signer address or empty>"
}
```

## Rebalance Detection

If the day's RPC calls surface any `Transfer` events matching known rebalance addresses, or if a transaction of type `rebalance` appears in the mempool / logs:

1. Build a `RebalanceLog` object with `before`/`after` allocation weights
2. Pin it to IPFS separately
3. Add its CID to `snapshot.rebalanceLogCids`

## Schema Validation

All payloads must pass runtime validation against `DailySnapshotSchema` (from `@zapengine/types/strategy`).

Schema version field enables forward compatibility: Pipedream compares its compiled schema version before publishing.

## Verification

The browser and CLI verifier now check:

- `DailySnapshotSchema`
- `snapshot[i].previousCid === cid(snapshot[i - 1])`
- canonical snapshot message hash
- EIP-191 signature recovery against the official signer
- daily return, cumulative return, max drawdown, and optional volatility/sharpe/sortino recomputation

## Error Handling

- If RPC fails: retry 3× with exponential backoff, then halt and alert.
- If IPFS pin fails: retry 3×, then halt and alert (do not update KV store).
- If GitHub commit fails: retry 3×, then halt and alert.
- Never update KV store unless GitHub commit succeeds.

## Deferred (v1+)

- [ ] Weekly on-chain anchor (settle weekly NAV to an anchor contract)
- [ ] Arweave backup
- [ ] zk proof of NAV integrity
