import { randomUUID } from 'node:crypto';

import { S3Client } from '@aws-sdk/client-s3';

import { getRequiredEnv, trimTrailingSlash } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import { classifyArtifactKey, planArtifactGc } from './artifact-retention.js';
import {
  deleteR2Objects,
  listR2Objects,
  type StoredObject,
} from './r2-objects.js';
import {
  getPipelineSupabase,
  type PipelineSupabaseClient,
  throwSupabaseError,
} from './supabase-client.js';

interface ReferenceState {
  references: Set<string>;
  retirements: Map<string, number>;
}
export interface GcDependencies {
  list: () => Promise<StoredObject[]>;
  readState: () => Promise<ReferenceState>;
  acquire: (owner: string) => Promise<void>;
  release: (owner: string) => Promise<void>;
  observe: (prefix: string, at: string) => Promise<void>;
  clearObservation: (prefix: string) => Promise<void>;
  remove: (keys: string[]) => Promise<void>;
  log: (event: Record<string, unknown>) => void;
}

export async function runArtifactGc(
  deps: GcDependencies,
  options: { apply?: boolean; now?: number } = {},
) {
  const owner = randomUUID();
  const now = options.now ?? Date.now();
  const summary = {
    dryRun: !options.apply,
    candidatePrefixes: 0,
    retainedReferences: 0,
    deletedObjects: 0,
    deletedBytes: 0,
    failures: 0,
  };
  if (options.apply) {
    deps.log({ event: 'gc:acquire', owner });
    await deps.acquire(owner);
  }
  try {
    const objects = await deps.list();
    const state = await deps.readState();
    const plan = planArtifactGc({ objects, ...state, now });
    summary.candidatePrefixes = plan.length;
    for (const candidate of plan) {
      deps.log({
        event: 'gc:candidate',
        prefix: candidate.prefix,
        decision: candidate.decision,
        objects: candidate.objects.length,
        bytes: candidate.bytes,
      });
      if (candidate.decision === 'referenced') {
        summary.retainedReferences++;
        if (options.apply) await deps.clearObservation(candidate.prefix);
        continue;
      }
      if (!options.apply || candidate.decision === 'malformed') continue;
      if (!state.retirements.has(candidate.prefix)) {
        await deps.observe(candidate.prefix, new Date(now).toISOString());
        continue;
      }
      if (candidate.decision !== 'eligible') continue;
      try {
        // The DB fence remains held throughout the R2 deletion. Re-reading
        // without that fence would leave a publication/deletion race.
        await deps.remove(candidate.objects.map((object) => object.key));
        summary.deletedObjects += candidate.objects.length;
        summary.deletedBytes += candidate.bytes;
        await deps.clearObservation(candidate.prefix);
        deps.log({
          event: 'gc:deleted',
          prefix: candidate.prefix,
          objects: candidate.objects.length,
          bytes: candidate.bytes,
        });
      } catch (error) {
        summary.failures++;
        deps.log({
          event: 'gc:failure',
          prefix: candidate.prefix,
          error: errorMessage(error),
        });
      }
    }
    deps.log({ event: 'gc:summary', ...summary });
    return summary;
  } finally {
    if (options.apply) await deps.release(owner);
  }
}

async function readRows(
  db: PipelineSupabaseClient,
  table: string,
  columns: string,
  key: string,
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  let cursor: string | undefined;
  for (;;) {
    let query = db.from(table).select(columns).order(key).limit(500);
    if (cursor) query = query.gt(key, cursor);
    const { data, error } = await query;
    if (error) throwSupabaseError(error);
    if (!Array.isArray(data))
      throw new Error(`Incomplete GC reference read: ${table}`);
    if (!data.length) return rows;
    const batch = data as unknown as Record<string, unknown>[];
    const next = batch.at(-1)?.[key];
    if (typeof next !== 'string' || (cursor && next <= cursor))
      throw new Error(`Invalid GC cursor: ${table}`);
    rows.push(...batch);
    cursor = next;
  }
}

export async function readArtifactReferences(
  db: PipelineSupabaseClient,
  publicBase: string,
): Promise<Set<string>> {
  const references = new Set<string>();
  const base = `${trimTrailingSlash(publicBase)}/`;
  function collect(value: unknown): void {
    if (typeof value === 'string') {
      const key = value.startsWith(base)
        ? decodeURIComponent(value.slice(base.length).split('?')[0]!)
        : value;
      const artifact =
        classifyArtifactKey(key) ??
        classifyArtifactKey(`${key.replace(/\/$/, '')}/manifest.json`) ??
        classifyArtifactKey(`${key.replace(/\/$/, '')}/visual-manifest.json`);
      if (artifact?.kind === 'video' || artifact?.kind === 'visual')
        references.add(artifact.prefix);
    } else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object')
      Object.values(value).forEach(collect);
  }
  // Preserve non-null references even on queued/failed rows, plus cross-prefix
  // URLs in persisted payloads. Status alone cannot prove an asset is unused.
  for (const row of await readRows(
    db,
    'episode_videos',
    'episode_localization_id,r2_prefix,mp4_url,thumbnail_url,manifest_url,captions_ass_url,manifest',
    'episode_localization_id',
  ))
    collect(row);
  for (const row of await readRows(
    db,
    'episode_video_visuals',
    'episode_id,r2_prefix,visual_payload,checkpoint',
    'episode_id',
  ))
    collect(row);
  return references;
}

export async function readArtifactReferenceState(
  db: PipelineSupabaseClient,
  publicBase: string,
): Promise<ReferenceState> {
  const references = await readArtifactReferences(db, publicBase);
  const retirements = new Map<string, number>();
  for (const row of await readRows(
    db,
    'artifact_retirements',
    'r2_prefix,unreferenced_at',
    'r2_prefix',
  )) {
    if (
      typeof row['r2_prefix'] !== 'string' ||
      typeof row['unreferenced_at'] !== 'string'
    )
      throw new Error('Invalid artifact retirement row');
    retirements.set(row['r2_prefix'], Date.parse(row['unreferenced_at']));
  }
  return { references, retirements };
}

export function createArtifactGcDependencies(): GcDependencies {
  const db = getPipelineSupabase();
  const Bucket = getRequiredEnv('R2_BUCKET_NAME');
  const base = getRequiredEnv('R2_PUBLIC_BASE_URL');
  const r2 = new S3Client({
    region: 'auto',
    endpoint: getRequiredEnv('R2_ENDPOINT'),
    forcePathStyle: true,
    credentials: {
      accessKeyId: getRequiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: getRequiredEnv('R2_SECRET_ACCESS_KEY'),
    },
  });
  async function rpc(name: string, owner: string) {
    const { error } = await db.rpc(name, { p_owner: owner });
    if (error) throwSupabaseError(error);
  }
  return {
    list: () => listR2Objects(r2, Bucket, 'episodes/'),
    readState: () => readArtifactReferenceState(db, base),
    acquire: (owner) => rpc('acquire_artifact_gc', owner),
    release: (owner) => rpc('release_artifact_gc', owner),
    observe: async (prefix, at) => {
      const { error } = await db
        .from('artifact_retirements')
        .upsert(
          { r2_prefix: prefix, unreferenced_at: at },
          { onConflict: 'r2_prefix', ignoreDuplicates: true },
        );
      if (error) throwSupabaseError(error);
    },
    clearObservation: async (prefix) => {
      const { error } = await db
        .from('artifact_retirements')
        .delete()
        .eq('r2_prefix', prefix);
      if (error) throwSupabaseError(error);
    },
    remove: (keys) => deleteR2Objects(r2, Bucket, keys),
    log: (event) => console.info(JSON.stringify(event)),
  };
}
