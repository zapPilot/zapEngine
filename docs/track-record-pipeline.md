# Track Record Pipeline — Pipedream Contract

Daily snapshot pipeline that generates, signs, pins, and publishes the Zap Pilot public track record.

## Architecture

```
Pipedream cron (daily)
  └─> Read latestSnapshotCid from Pipedream KV store
  └─> Fetch on-chain balances + prices (RPC)
  └─> Generate DailySnapshot payload with previousCid = latestSnapshotCid
  └─> (Optionally) Sign payload with Zap Pilot official EOA
  └─> Pin signed snapshot JSON to IPFS  --> get new CID
  └─> Update Pipedream KV store: latestSnapshotCid = new CID
  └─> Update apps/landing-page/public/track-record-meta.json (via GitHub API commit)
```

## Input / Configuration

| Var | Description |
|-----|-------------|
| `KV_STORE:latestSnapshotCid` | Last committed snapshot CID (or empty on first run) |
| `MODEL_WALLET_ADDRESSES` | Comma-separated wallet addresses to track |
| `CHAIN_IDS` | Comma-separated chain IDs (e.g. `1,Arbitrum`) |
| `RPC_URLS` | Comma-separated RPC endpoints (index-aligned with CHAIN_IDS) |
| `PRICE_ORACLE_URL` | Price feed endpoint |
| `IPFS_PINATA_TOKEN` | Pinata API token for IPFS pinning |
| `ZAP_PILOT_SIGNER_KEY` | Private key for EOA signing (optional in v0) |

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

### 6. Sign payload (optional, v0)

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

### 7. Pin to IPFS

POST to Pinata `/pinning/pinJSONToAPI` with the snapshot payload.

Record returned `IpfsHash` as `newCid`.

### 8. Update KV store

```
KV_STORE:latestSnapshotCid = newCid
```

### 9. Commit meta file to GitHub

PATCH to `https://api.github.com/repos/{owner}/{repo}/contents/apps/landing-page/public/track-record-meta.json`

Get current file SHA, then commit with new content:
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

## Error Handling

- If RPC fails: retry 3× with exponential backoff, then halt and alert.
- If IPFS pin fails: retry 3×, then halt and alert (do not update KV store).
- If GitHub commit fails: retry 3×, then halt and alert.
- Never update KV store unless GitHub commit succeeds.

## Deferred (v1+)

- [ ] Weekly on-chain anchor (settle weekly NAV to an anchor contract)
- [ ] Arweave backup
- [ ] zk proof of NAV integrity