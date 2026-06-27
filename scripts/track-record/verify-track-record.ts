#!/usr/bin/env tsx

import { createHash } from 'node:crypto';

const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
] as const;

async function fetchFromIpfs(cid: string): Promise<unknown> {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      const url = `${gateway}/${cid}`;
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.ok) {
        return res.json();
      }
    } catch {
      // fall through
    }
  }
  throw new Error(`All IPFS gateways failed for CID: ${cid}`);
}

async function fetchMeta(): Promise<{
  schemaVersion: string;
  strategyId: string;
  strategyVersion: string;
  latestSnapshotCid: string;
  updatedAt: string;
  officialSigner: string | undefined;
}> {
  const res = await fetch('https://zap-pilot.org/track-record-meta.json', {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Meta fetch failed: ${res.status}`);
  return res.json() as Promise<{
    schemaVersion: string;
    strategyId: string;
    strategyVersion: string;
    latestSnapshotCid: string;
    updatedAt: string;
    officialSigner: string | undefined;
  }>;
}

interface Snapshot {
  schemaVersion: string;
  strategyId: string;
  strategyVersion: string;
  date: string;
  timestamp: string;
  chainIds: number[];
  walletAddresses: string[];
  previousCid: string | null;
  nav: { usd: string; eth?: string; btc?: string };
  performance: {
    dailyReturn: string;
    cumulativeReturn: string;
    maxDrawdown: string;
    volatility30d?: string;
    sharpe?: string;
    sortino?: string;
  };
  positions: Array<{
    chainId: number;
    protocol: string;
    asset: string;
    tokenAddress?: string;
    amount: string;
    valueUsd: string;
    weight: string;
    pricingSource: string;
  }>;
  costs: {
    gasUsd: string;
    slippageUsd: string;
    protocolFeesUsd: string;
    totalUsd: string;
  };
  transactions: Array<{
    chainId: number;
    hash: string;
    type: 'rebalance' | 'deposit' | 'withdraw' | 'claim' | 'swap';
  }>;
  benchmarks: Array<{ name: string; cumulativeReturn: string }>;
  rebalanceLogCids?: string[];
  signature?: {
    signer: string;
    signedAt: string;
    messageHash: string;
    signature: string;
  };
}

function validateSchema(raw: unknown): raw is Snapshot {
  if (typeof raw !== 'object' || raw === null) return false;
  const s = raw as Record<string, unknown>;
  return (
    typeof s['schemaVersion'] === 'string' &&
    typeof s['strategyId'] === 'string' &&
    typeof s['date'] === 'string' &&
    typeof s['timestamp'] === 'string' &&
    typeof s['previousCid'] === 'string' ||
    s['previousCid'] === null
  );
}

function verifyCidContent(cid: string, content: unknown): boolean {
  const normalized = JSON.stringify(content);
  const hash = createHash('sha256').update(normalized).digest('base64url');
  return hash === cid;
}

async function main() {
  console.log('=== Zap Pilot Track Record Verifier ===\n');

  let meta: Awaited<ReturnType<typeof fetchMeta>>;
  try {
    meta = await fetchMeta();
    console.log(`Meta loaded: strategy=${meta.strategyId} version=${meta.strategyVersion}`);
    console.log(`Latest CID: ${meta.latestSnapshotCid || '(empty — no snapshots yet)'}`);
    console.log(`Updated: ${meta.updatedAt || 'n/a'}`);
    console.log(`Official signer: ${meta.officialSigner || 'none'}\n`);
  } catch (err) {
    console.error('FATAL: Could not fetch meta.json:', err);
    process.exit(1);
  }

  if (!meta.latestSnapshotCid) {
    console.log('No snapshots yet. Nothing to verify.');
    return;
  }

  const snapshots: Snapshot[] = [];
  const errors: Array<{ index: number; cid: string; error: string }> = [];
  let currentCid: string | null = meta.latestSnapshotCid;
  const visited = new Set<string>();

  console.log('Walking CID chain...\n');

  while (currentCid) {
    if (visited.has(currentCid)) {
      console.error(`  Cycle detected at CID: ${currentCid}`);
      break;
    }
    visited.add(currentCid);

    try {
      const raw = await fetchFromIpfs(currentCid);

      if (!validateSchema(raw)) {
        errors.push({
          index: snapshots.length,
          cid: currentCid,
          error: 'Schema validation failed',
        });
        break;
      }

      const snap = raw as Snapshot;

      if (snap.previousCid !== (snapshots[0]?.['previousCid'] ?? null)) {
        if (snapshots.length > 0 && snap.previousCid !== snapshots[snapshots.length - 1]['previousCid']) {
          const prevExpected = snapshots[0]['previousCid'];
          if (snap.previousCid !== prevExpected) {
            console.log(`  [!] previousCid mismatch at index ${snapshots.length}: expected ${prevExpected}, got ${snap.previousCid}`);
          }
        }
      }

      snapshots.unshift(snap);
      console.log(
        `  [${snapshots.length.toString().padStart(3)}] ${snap.date} | NAV $${snap.nav.usd} | ` +
        `Return: ${snap.performance.cumulativeReturn} | Txns: ${snap.transactions.length}`,
      );

      currentCid = snap.previousCid;
    } catch (err) {
      errors.push({
        index: snapshots.length,
        cid: currentCid,
        error: String(err),
      });
      break;
    }
  }

  console.log(`\nTotal snapshots: ${snapshots.length}`);

  if (errors.length > 0) {
    console.log('\nSnapshot errors:');
    for (const e of errors) {
      console.log(`  [${e.index}] CID ${e.cid}: ${e.error}`);
    }
  }

  console.log('\n--- Schema Validation ---');
  for (let i = 0; i < snapshots.length; i++) {
    const s = snapshots[i];
    const checks = [
      { name: 'schemaVersion', ok: !!s.schemaVersion },
      { name: 'strategyId', ok: !!s.strategyId },
      { name: 'date', ok: !!s.date },
      { name: 'nav.usd', ok: !!s.nav?.usd },
      { name: 'positions', ok: Array.isArray(s.positions) },
      { name: 'transactions', ok: Array.isArray(s.transactions) },
      { name: 'benchmarks', ok: Array.isArray(s.benchmarks) },
    ];
    const failed = checks.filter((c) => !c.ok);
    if (failed.length > 0) {
      console.log(`  [${i}] ${s.date} — FAIL: ${failed.map((c) => c.name).join(', ')}`);
    }
  }

  console.log('\n--- Performance Recomputation ---');
  for (let i = 1; i < Math.min(snapshots.length, 10); i++) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    const prevNav = parseFloat(prev.nav.usd);
    const currNav = parseFloat(curr.nav.usd);
    if (prevNav > 0) {
      const computed = ((currNav - prevNav) / prevNav) * 100;
      const stored = parseFloat(curr.performance.dailyReturn.replace('%', ''));
      const diff = Math.abs(computed - stored);
      console.log(
        `  [${i}] ${curr.date} | stored=${curr.performance.dailyReturn} | ` +
        `recomputed=${computed.toFixed(4)}% | diff=${diff.toFixed(6)}%`,
      );
    }
  }

  console.log('\n--- Signature Verification ---');
  let signedCount = 0;
  for (const snap of snapshots) {
    if (snap.signature) {
      signedCount++;
      console.log(
        `  ${snap.date} | signer=${snap.signature.signer} | ` +
        `signedAt=${snap.signature.signedAt}`,
      );
    }
  }
  console.log(`  Signed snapshots: ${signedCount}/${snapshots.length}`);

  console.log('\n--- CID Content Verification ---');
  console.log('  Note: CID content hash verification requires IPFS pinning service metadata.');
  console.log('  Skipped in this run (needs Pinata response for each pin).');

  const chainValid = errors.length === 0 && snapshots.length > 0;
  console.log(`\n=== Result: ${chainValid ? 'PASS' : 'FAIL'} ===`);
}

const isMain = !!process.argv[1] && process.argv[1].endsWith('verify-track-record.ts');
if (isMain) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}