import { createHash, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, rename, rm } from 'node:fs/promises';
import { z } from 'zod';

function canonical(value: unknown): unknown {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .map(([key, item]) => [key, canonical(item)]),
    );
  }
  throw new Error('Fingerprint requires plain JSON data');
}
export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonical(value));
}
export function fingerprintOf(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}
export async function sha256File(file: string): Promise<string> {
  return createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
}
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const fields = {
  sha256: hash,
  bytes: z.number().int().positive(),
  renderedAt: z.iso.datetime(),
  sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
};
export const sidecarSchema = z.strictObject({
  ...fields,
  fingerprint: hash.optional(),
  durationSeconds: z.number().positive().optional(),
});
export const artifactSchema = z.strictObject({
  ...fields,
  fingerprint: hash,
  url: z.url(),
  contentType: z.enum(['application/pdf', 'video/mp4', 'image/jpeg']),
});
export const manifestSchema = z.strictObject({
  release: z
    .string()
    .regex(/^\d{8}-\d{6}-[a-f0-9]{8}$/)
    .nullable(),
  artifacts: z.record(z.string(), artifactSchema),
});
export type Sidecar = z.infer<typeof sidecarSchema>;
export type Artifact = z.infer<typeof artifactSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
export async function writeJsonAtomic(
  file: string,
  value: unknown,
): Promise<void> {
  const temporary = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + '\n', {
      flag: 'wx',
    });
    await rename(temporary, file);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function readSidecar(file: string): Promise<Sidecar> {
  return sidecarSchema.parse(JSON.parse(await readFile(file, 'utf8')));
}
export async function writeSidecar(
  file: string,
  value: Sidecar,
): Promise<void> {
  await writeJsonAtomic(file, sidecarSchema.parse(value));
}
export function readSourceCommit(cwd: string): string {
  return execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd,
    encoding: 'utf8',
  }).trim();
}
export function newReleaseId(
  now = new Date(),
  suffix = randomBytes(4).toString('hex'),
): string {
  return `${now.toISOString().slice(0, 19).replaceAll('-', '').replaceAll(':', '').replace('T', '-')}-${suffix}`;
}
export type PublishPlan =
  | { action: 'upload'; sidecar: Sidecar }
  | { action: 'retain'; artifact: Artifact };
export function planPublish(input: {
  expected: string;
  sidecar?: Sidecar;
  actualHash?: string;
  actualBytes?: number;
  published?: Artifact;
  renderCommand: string;
}): PublishPlan {
  const {
    expected,
    sidecar,
    actualHash,
    actualBytes,
    published,
    renderCommand,
  } = input;
  if (
    sidecar?.fingerprint === expected &&
    sidecar.sha256 === actualHash &&
    sidecar.bytes === actualBytes &&
    (published === undefined ||
      (Date.parse(sidecar.renderedAt) > Date.parse(published.renderedAt) &&
        sidecar.sha256 !== published.sha256))
  ) {
    return { action: 'upload', sidecar };
  }
  if (published?.fingerprint === expected) {
    return { action: 'retain', artifact: published };
  }
  throw new Error(`Stale or missing artifact. Run ${renderCommand}`);
}
export async function verifyPublicArtifact(
  artifact: Artifact,
  options: {
    disposition?: string;
    fetch?: typeof fetch;
    attempts?: number;
  } = {},
): Promise<void> {
  const request = options.fetch ?? fetch;
  const attempts = options.attempts ?? 3;
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('attempts must be positive');
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      const head = await request(artifact.url, {
        method: 'HEAD',
        headers: { 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(30000),
      });
      if (
        !head.ok ||
        head.headers.get('content-type')?.split(';')[0] !==
          artifact.contentType ||
        head.headers.get('content-length') !== String(artifact.bytes) ||
        !/\bimmutable\b/.test(head.headers.get('cache-control') ?? '') ||
        !/\bmax-age=31536000\b/.test(head.headers.get('cache-control') ?? '') ||
        !/\bpublic\b/.test(head.headers.get('cache-control') ?? '') ||
        (options.disposition !== undefined &&
          head.headers.get('content-disposition') !== options.disposition)
      ) {
        throw new Error('Public artifact headers differ');
      }
      if (artifact.contentType === 'video/mp4') {
        const range = await request(artifact.url, {
          headers: { Range: 'bytes=0-1', 'Accept-Encoding': 'identity' },
          signal: AbortSignal.timeout(30000),
        });
        if (
          range.status !== 206 ||
          range.headers.get('content-range') !==
            `bytes 0-1/${artifact.bytes}` ||
          (await range.arrayBuffer()).byteLength !== 2
        ) {
          throw new Error('MP4 Range request failed');
        }
      }
      const response = await request(artifact.url, {
        headers: { 'Accept-Encoding': 'identity' },
        signal: AbortSignal.timeout(120000),
      });
      const body = Buffer.from(await response.arrayBuffer());
      if (
        !response.ok ||
        body.length !== artifact.bytes ||
        createHash('sha256').update(body).digest('hex') !== artifact.sha256
      ) {
        throw new Error('Public artifact checksum differs');
      }
      return;
    } catch (error) {
      if (attempt === attempts - 1) {
        throw error;
      }
    }
  }
}
