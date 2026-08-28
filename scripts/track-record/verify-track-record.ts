#!/usr/bin/env tsx

import type { TrackRecordMeta } from '../../packages/types/src/strategy/index.js';
import {
  DailySnapshotSchema,
  TrackRecordMetaSchema,
} from '../../packages/types/src/strategy/index.js';
import {
  createSnapshotMessageHash,
  verifyCidChain,
  verifyPerformanceMetrics,
  verifySignature,
} from '../../apps/landing-page/src/data/track-record-accessor';
import type { SnapshotHistoryEntry } from '../../apps/landing-page/src/data/track-record-accessor';
import { fetchFromIpfs, fetchJson } from './ipfs.js';

const DEFAULT_META_URL = 'https://zap-pilot.org/track-record-meta.json';

async function fetchMeta(): Promise<TrackRecordMeta> {
  const metaUrl = process.env['TRACK_RECORD_META_URL'] ?? DEFAULT_META_URL;
  return TrackRecordMetaSchema.parse(await fetchJson(metaUrl, 10_000));
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
  const { errors: performanceErrors } = verifyPerformanceMetrics(snapshots);
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
