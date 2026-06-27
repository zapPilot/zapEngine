#!/usr/bin/env tsx

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TrackRecordMeta } from '../../packages/types/src/strategy/index.js';
import {
  DailySnapshotSchema,
  TrackRecordMetaSchema,
} from '../../packages/types/src/strategy/index.js';

const DEFAULT_PIN_ENDPOINT = 'https://api.pinata.cloud/pinning/pinJSONToIPFS';
const DEFAULT_META_PATH = 'apps/landing-page/public/track-record-meta.json';

function parseArgs(): { snapshotPath: string; metaPath: string } {
  const snapshotIndex = process.argv.indexOf('--snapshot');
  const snapshotPath =
    snapshotIndex >= 0 ? process.argv[snapshotIndex + 1] : undefined;
  if (!snapshotPath) {
    throw new Error('Usage: pnpm track-record:publish -- --snapshot <path>');
  }

  const metaIndex = process.argv.indexOf('--meta');
  return {
    snapshotPath,
    metaPath:
      metaIndex >= 0 && process.argv[metaIndex + 1]
        ? process.argv[metaIndex + 1]!
        : DEFAULT_META_PATH,
  };
}

function pinataToken(): string {
  const token =
    process.env['TRACK_RECORD_IPFS_PINATA_TOKEN'] ??
    process.env['IPFS_PINATA_TOKEN'] ??
    process.env['PINATA_JWT'];
  if (!token) {
    throw new Error(
      'Missing TRACK_RECORD_IPFS_PINATA_TOKEN, IPFS_PINATA_TOKEN, or PINATA_JWT',
    );
  }
  return token;
}

async function pinSnapshot(snapshot: unknown): Promise<string> {
  const endpoint =
    process.env['TRACK_RECORD_IPFS_PIN_ENDPOINT'] ?? DEFAULT_PIN_ENDPOINT;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pinataToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pinataMetadata: {
        name: `zap-pilot-track-record-${new Date().toISOString()}`,
      },
      pinataContent: snapshot,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    throw new Error(`IPFS pin failed: HTTP ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as { IpfsHash?: string; cid?: string };
  const cid = body.IpfsHash ?? body.cid;
  if (!cid) throw new Error('IPFS pin response did not include a CID');
  return cid;
}

async function readMeta(metaPath: string): Promise<TrackRecordMeta> {
  return TrackRecordMetaSchema.parse(
    JSON.parse(await readFile(metaPath, 'utf8')),
  );
}

async function main(): Promise<void> {
  const { snapshotPath, metaPath } = parseArgs();
  const snapshot = DailySnapshotSchema.parse(
    JSON.parse(await readFile(snapshotPath, 'utf8')),
  );
  const currentMeta = await readMeta(metaPath);
  const cid = await pinSnapshot(snapshot);
  const nextMeta = TrackRecordMetaSchema.parse({
    ...currentMeta,
    schemaVersion: snapshot.schemaVersion,
    strategyId: snapshot.strategyId,
    strategyVersion: snapshot.strategyVersion,
    latestSnapshotCid: cid,
    updatedAt: new Date().toISOString(),
    officialSigner: snapshot.signature?.signer ?? currentMeta.officialSigner,
  });

  await writeFile(
    path.resolve(metaPath),
    `${JSON.stringify(nextMeta, null, 2)}\n`,
  );

  console.log(`Pinned DailySnapshot: ${cid}`);
  console.log(`Updated meta: ${metaPath}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
