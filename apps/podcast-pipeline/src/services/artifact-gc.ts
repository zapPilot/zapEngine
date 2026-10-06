import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';

import { getRequiredEnv, trimTrailingSlash } from '../lib/env.js';
import { errorMessage } from '../lib/errorMessage.js';
import {
  type ArtifactCandidate,
  classifyArtifactKey,
  planArtifactGc,
} from './artifact-retention.js';
import {
  createR2ClientFromEnv,
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
  list: (prefix?: string) => Promise<StoredObject[]>;
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
  options: {
    apply?: boolean;
    now?: number;
    owner?: string;
    maxMinutes?: number;
  } = {},
) {
  const owner = options.owner ?? randomUUID();
  const started = Date.now();
  const objects = await deps.list();
  const now = options.now ?? Date.now();
  const summary = {
    dryRun: !options.apply,
    candidatePrefixes: 0,
    retainedReferences: 0,
    deletedObjects: 0,
    deletedBytes: 0,
    failures: 0,
  };
  if (options.apply && !(await acquireGc(deps, owner))) return summary;
  try {
    const state = await deps.readState();
    const plan = planArtifactGc({ objects, ...state, now });
    summary.candidatePrefixes = plan.length;
    for (const candidate of plan) {
      if (
        options.maxMinutes !== undefined &&
        Date.now() - started >= options.maxMinutes * 60_000
      )
        break;
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
      const deleted = await deleteCandidate(
        deps,
        candidate,
        state,
        options.now ?? Date.now(),
      );
      summary.deletedObjects += deleted.objects;
      summary.deletedBytes += deleted.bytes;
      summary.failures += deleted.failures;
    }
    deps.log({ event: 'gc:summary', ...summary });
    return summary;
  } finally {
    if (options.apply) await releaseArtifactGcOwner(deps, owner);
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
  const r2 = createR2ClientFromEnv();
  async function rpc(name: string, owner: string) {
    const { error } = await db.rpc(name, { p_owner: owner });
    if (error) {
      if (
        name === 'acquire_artifact_gc' &&
        (error.code === '55P03' ||
          (error.code === '55000' &&
            error.message.includes('processing jobs remain')))
      )
        throw new ArtifactGcBusyError(error.message);
      if (
        name === 'release_artifact_gc' &&
        error.code === '55000' &&
        error.message.includes('owner mismatch')
      )
        return;
      throwSupabaseError(error);
    }
  }
  return {
    list: (prefix = 'episodes/') => listR2Objects(r2, Bucket, prefix),
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

export class ArtifactGcBusyError extends Error {}

export async function releaseArtifactGcOwner(
  deps: Pick<GcDependencies, 'release'>,
  owner: string,
): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await deps.release(owner);
      return;
    } catch (error) {
      if (attempt === 3) throw error;
      await delay(250 * 2 ** attempt);
    }
  }
}

async function acquireGc(
  deps: GcDependencies,
  owner: string,
): Promise<boolean> {
  deps.log({ event: 'gc:acquire', owner });
  try {
    await deps.acquire(owner);
    return true;
  } catch (error) {
    if (!(error instanceof ArtifactGcBusyError)) throw error;
    deps.log({ event: 'gc:skipped', reason: error.message });
    console.warn(`::warning::${error.message}`);
    return false;
  }
}
async function deleteCandidate(
  deps: GcDependencies,
  candidate: ArtifactCandidate,
  state: ReferenceState,
  now: number,
) {
  let objects = 0;
  let bytes = 0;
  try {
    const refreshed = planArtifactGc({
      objects: await deps.list(`${candidate.prefix}/`),
      ...state,
      now,
    });
    const current = refreshed.find((item) => item.prefix === candidate.prefix);
    if (current?.decision !== 'eligible')
      return { objects: 0, bytes: 0, failures: 0 };
    await deps.remove(current.objects.map((object) => object.key));
    objects = current.objects.length;
    bytes = current.bytes;
    await deps.clearObservation(current.prefix);
    deps.log({
      event: 'gc:deleted',
      prefix: current.prefix,
      objects: current.objects.length,
      bytes: current.bytes,
    });
    return {
      objects: current.objects.length,
      bytes: current.bytes,
      failures: 0,
    };
  } catch (error) {
    deps.log({
      event: 'gc:failure',
      prefix: candidate.prefix,
      error: errorMessage(error),
    });
    return { objects, bytes, failures: 1 };
  }
}
