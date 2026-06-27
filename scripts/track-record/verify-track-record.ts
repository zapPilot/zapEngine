#!/usr/bin/env tsx

import { readFile } from 'node:fs/promises';
import type {
  DailySnapshot,
  TrackRecordMeta,
} from '../../packages/types/src/strategy/index.js';
import {
  DailySnapshotSchema,
  TrackRecordMetaSchema,
} from '../../packages/types/src/strategy/index.js';
import {
  createSnapshotMessageHash,
  verifyCidChain,
  verifySignature,
} from '../../apps/landing-page/src/data/track-record-accessor';
import type { SnapshotHistoryEntry } from '../../apps/landing-page/src/data/track-record-accessor';

const DEFAULT_META_URL = 'https://zap-pilot.org/track-record-meta.json';
const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
] as const;

const PERCENT_TOLERANCE = 0.02;
const RATIO_TOLERANCE = 0.02;

async function fetchJson(url: string, timeoutMs: number): Promise<unknown> {
  if (url.startsWith('file://')) {
    return JSON.parse(await readFile(new URL(url), 'utf8'));
  }

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid JSON from ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

async function fetchFromIpfs(cid: string): Promise<unknown> {
  for (const gateway of IPFS_GATEWAYS) {
    const url = `${gateway}/${cid}`;
    try {
      return await fetchJson(url, 12_000);
    } catch {
      // Try the next gateway.
    }
  }
  throw new Error(`All IPFS gateways failed for CID: ${cid}`);
}

async function fetchMeta(): Promise<TrackRecordMeta> {
  const metaUrl = process.env['TRACK_RECORD_META_URL'] ?? DEFAULT_META_URL;
  return TrackRecordMetaSchema.parse(await fetchJson(metaUrl, 10_000));
}

function parsePercent(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRatio(value: string | undefined): number | null {
  if (!value || value === '—') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDiff(actual: number, expected: number): string {
  return `stored=${actual.toFixed(4)}, recomputed=${expected.toFixed(4)}`;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function annualizedVolatility(returns: number[]): number {
  if (returns.length === 0) return 0;
  const avg = mean(returns);
  const variance =
    returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    returns.length;
  return Math.sqrt(variance * 252);
}

function annualizedDownsideDeviation(returns: number[]): number {
  const negativeReturns = returns.filter((value) => value < 0);
  if (negativeReturns.length === 0) return 0;
  return Math.sqrt(
    (negativeReturns.reduce((sum, value) => sum + value ** 2, 0) /
      negativeReturns.length) *
      252,
  );
}

function verifyPerformanceMetrics(snapshots: DailySnapshot[]): string[] {
  const errors: string[] = [];
  if (snapshots.length === 0) return errors;

  const firstNav = Number(snapshots[0]!.nav.usd);
  if (!Number.isFinite(firstNav) || firstNav <= 0) {
    return ['first snapshot NAV is not a positive number'];
  }

  const dailyReturns: number[] = [];
  let peakNav = firstNav;

  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i]!;
    const nav = Number(snapshot.nav.usd);
    if (!Number.isFinite(nav) || nav <= 0) {
      errors.push(`[${i}] ${snapshot.date}: NAV is not a positive number`);
      continue;
    }

    const storedCumulative = parsePercent(
      snapshot.performance.cumulativeReturn,
    );
    const recomputedCumulative = (nav / firstNav - 1) * 100;
    if (
      storedCumulative !== null &&
      Math.abs(storedCumulative - recomputedCumulative) > PERCENT_TOLERANCE
    ) {
      errors.push(
        `[${i}] ${snapshot.date}: cumulativeReturn mismatch (${formatDiff(
          storedCumulative,
          recomputedCumulative,
        )})`,
      );
    }

    if (nav > peakNav) peakNav = nav;
    const recomputedDrawdown = (nav / peakNav - 1) * 100;
    const storedDrawdown = parsePercent(snapshot.performance.maxDrawdown);
    if (
      storedDrawdown !== null &&
      Math.abs(storedDrawdown - recomputedDrawdown) > PERCENT_TOLERANCE
    ) {
      errors.push(
        `[${i}] ${snapshot.date}: maxDrawdown mismatch (${formatDiff(
          storedDrawdown,
          recomputedDrawdown,
        )})`,
      );
    }

    if (i === 0) {
      dailyReturns.push(0);
      continue;
    }

    const previousNav = Number(snapshots[i - 1]!.nav.usd);
    const dailyReturn = previousNav > 0 ? nav / previousNav - 1 : 0;
    dailyReturns.push(dailyReturn);

    const storedDaily = parsePercent(snapshot.performance.dailyReturn);
    const recomputedDaily = dailyReturn * 100;
    if (
      storedDaily !== null &&
      Math.abs(storedDaily - recomputedDaily) > PERCENT_TOLERANCE
    ) {
      errors.push(
        `[${i}] ${snapshot.date}: dailyReturn mismatch (${formatDiff(
          storedDaily,
          recomputedDaily,
        )})`,
      );
    }

    const rollingReturns = dailyReturns.slice(Math.max(1, i - 29), i + 1);
    if (rollingReturns.length >= 30) {
      const vol30d = annualizedVolatility(rollingReturns);
      const storedVol = parsePercent(snapshot.performance.volatility30d);
      if (
        storedVol !== null &&
        Math.abs(storedVol - vol30d * 100) > PERCENT_TOLERANCE
      ) {
        errors.push(
          `[${i}] ${snapshot.date}: volatility30d mismatch (${formatDiff(
            storedVol,
            vol30d * 100,
          )})`,
        );
      }

      const annualMean = mean(rollingReturns) * 252;
      const storedSharpe = parseRatio(snapshot.performance.sharpe);
      if (storedSharpe !== null && vol30d > 0) {
        const recomputedSharpe = annualMean / vol30d;
        if (Math.abs(storedSharpe - recomputedSharpe) > RATIO_TOLERANCE) {
          errors.push(
            `[${i}] ${snapshot.date}: sharpe mismatch (${formatDiff(
              storedSharpe,
              recomputedSharpe,
            )})`,
          );
        }
      }

      const downsideDeviation = annualizedDownsideDeviation(rollingReturns);
      const storedSortino = parseRatio(snapshot.performance.sortino);
      if (storedSortino !== null && downsideDeviation > 0) {
        const recomputedSortino = annualMean / downsideDeviation;
        if (Math.abs(storedSortino - recomputedSortino) > RATIO_TOLERANCE) {
          errors.push(
            `[${i}] ${snapshot.date}: sortino mismatch (${formatDiff(
              storedSortino,
              recomputedSortino,
            )})`,
          );
        }
      }
    }
  }

  return errors;
}

async function main() {
  console.log('=== Zap Pilot Track Record Verifier ===\n');

  let meta: TrackRecordMeta;
  try {
    meta = await fetchMeta();
    console.log(
      `Meta loaded: strategy=${meta.strategyId} version=${meta.strategyVersion}`,
    );
    console.log(`Latest CID: ${meta.latestSnapshotCid || '(empty)'}`);
    console.log(`Updated: ${meta.updatedAt || 'n/a'}`);
    console.log(`Official signer: ${meta.officialSigner || 'none'}\n`);
  } catch (err) {
    console.error('FATAL: Could not fetch meta:', err);
    process.exit(1);
  }

  if (!meta.latestSnapshotCid) {
    console.log('No snapshots yet. Nothing to verify.');
    return;
  }

  const entries: SnapshotHistoryEntry[] = [];
  const errors: string[] = [];
  let currentCid: string | null = meta.latestSnapshotCid;
  const visited = new Set<string>();

  console.log('Walking CID chain...\n');

  while (currentCid) {
    if (visited.has(currentCid)) {
      errors.push(`Cycle detected at CID: ${currentCid}`);
      break;
    }
    visited.add(currentCid);

    try {
      const raw = await fetchFromIpfs(currentCid);
      const snapshot = DailySnapshotSchema.parse(raw);
      entries.unshift({ cid: currentCid, snapshot });
      console.log(
        `  [${entries.length.toString().padStart(3)}] ${snapshot.date} | ` +
          `cid=${currentCid.slice(0, 16)}… | NAV $${snapshot.nav.usd}`,
      );
      currentCid = snapshot.previousCid;
    } catch (err) {
      errors.push(
        `CID ${currentCid}: ${err instanceof Error ? err.message : String(err)}`,
      );
      break;
    }
  }

  const snapshots = entries.map((entry) => entry.snapshot);
  console.log(`\nTotal snapshots: ${snapshots.length}`);

  console.log('\n--- CID Linkage ---');
  const chain = verifyCidChain(entries);
  console.log(
    `  ${chain.valid ? 'PASS' : 'FAIL'} (${chain.totalSnapshots} snapshots)` +
      (chain.reason ? ` — ${chain.reason} at ${chain.brokenAt}` : ''),
  );
  if (!chain.valid) {
    errors.push(
      `CID chain failed: ${chain.reason ?? 'unknown'} at ${chain.brokenAt}`,
    );
  }

  console.log('\n--- Signature Verification ---');
  let signedCount = 0;
  for (const entry of entries) {
    const signature = await verifySignature(
      entry.snapshot,
      meta.officialSigner ?? '',
    );
    if (signature.signaturePresent) signedCount++;

    const label = signature.valid ? 'PASS' : 'FAIL';
    console.log(
      `  ${label} ${entry.snapshot.date} | cid=${entry.cid.slice(0, 16)}…` +
        (signature.recoveredSigner
          ? ` | recovered=${signature.recoveredSigner}`
          : '') +
        (signature.reason ? ` | ${signature.reason}` : ''),
    );

    if (!signature.valid) {
      errors.push(
        `signature failed for ${entry.snapshot.date}: ${signature.reason ?? 'unknown'}`,
      );
    }
  }
  console.log(`  Signed snapshots: ${signedCount}/${snapshots.length}`);

  console.log('\n--- Message Hash Verification ---');
  for (const entry of entries.filter((item) => item.snapshot.signature)) {
    const computed = createSnapshotMessageHash(entry.snapshot);
    const stored = entry.snapshot.signature!.messageHash;
    const ok = computed.toLowerCase() === stored.toLowerCase();
    console.log(
      `  ${ok ? 'PASS' : 'FAIL'} ${entry.snapshot.date} | ` +
        `stored=${stored.slice(0, 18)}… | computed=${computed.slice(0, 18)}…`,
    );
    if (!ok) {
      errors.push(`message hash mismatch for ${entry.snapshot.date}`);
    }
  }

  console.log('\n--- Performance Recomputation ---');
  const performanceErrors = verifyPerformanceMetrics(snapshots);
  if (performanceErrors.length === 0) {
    console.log('  PASS');
  } else {
    for (const error of performanceErrors) {
      console.log(`  FAIL ${error}`);
      errors.push(error);
    }
  }

  console.log(`\n=== Result: ${errors.length === 0 ? 'PASS' : 'FAIL'} ===`);
  if (errors.length > 0) {
    process.exit(1);
  }
}

const isMain =
  !!process.argv[1] && process.argv[1].endsWith('verify-track-record.ts');

if (isMain) {
  main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
