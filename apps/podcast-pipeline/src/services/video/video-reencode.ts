import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { HeadObjectCommand } from '@aws-sdk/client-s3';
import { z } from 'zod';

import { assertOnlyKnownFlags, parseFlagArgs } from '../../lib/cli-args.js';
import { runCli } from '../../lib/cli-runner.js';
import { getRequiredEnv, trimTrailingSlash } from '../../lib/env.js';
import { isMainModule } from '../../lib/is-main-module.js';
import { createR2ClientFromEnv, downloadR2Object } from '../r2-objects.js';
import { uploadVideoArtifactsToR2 } from '../storage.js';
import { getPipelineSupabase, throwSupabaseError } from '../supabase-client.js';
import { resolveVideoFfprobePath } from './audio-analysis.js';
import {
  resolveVideoFfmpegPath,
  runProcess,
  videoCodecArgs,
  X264_CRF,
} from './ffmpeg-video.js';

const rowSchema = z.object({
  episode_localization_id: z.string().uuid(),
  status: z.literal('completed'),
  r2_prefix: z.string(),
  mp4_url: z.string(),
  thumbnail_url: z.string(),
  manifest_url: z.string(),
  captions_ass_url: z.string(),
  duration_seconds: z.number().positive(),
});
const candidateSchema = rowSchema.extend({
  bytes: z.number().positive(),
  kbps: z.number().positive(),
});
type Candidate = z.infer<typeof candidateSchema>;
const files = [
  'video.mp4',
  'thumbnail.png',
  'manifest.json',
  'captions.ass',
] as const;
const fields = [
  'mp4_url',
  'thumbnail_url',
  'manifest_url',
  'captions_ass_url',
] as const;

export function validateReencodeCandidate(
  row: z.infer<typeof rowSchema>,
  base: string,
): void {
  if (
    !/^episodes\/[a-zA-Z0-9][a-zA-Z0-9._-]*\/localizations\/(zh-Hant|ja|en)\/video\/[a-zA-Z0-9][a-zA-Z0-9._-]*\/[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(
      row.r2_prefix,
    )
  )
    throw new Error('Invalid video prefix');
  for (let i = 0; i < fields.length; i++)
    if (
      row[fields[i]!] !==
      `${trimTrailingSlash(base)}/${row.r2_prefix}/${files[i]}`
    )
      throw new Error('Video URLs do not belong to the original prefix');
}
const probeSchema = z.object({
  streams: z.array(
    z.object({
      codec_type: z.string(),
      width: z.number().optional(),
      height: z.number().optional(),
      avg_frame_rate: z.string().optional(),
    }),
  ),
  format: z.object({ duration: z.coerce.number().positive() }),
});
async function probe(path: string) {
  const result = await runProcess(resolveVideoFfprobePath(), [
    '-v',
    'error',
    '-show_streams',
    '-show_format',
    '-of',
    'json',
    path,
  ]);
  return probeSchema.parse(JSON.parse(result.stdout));
}
export function validateReencodedMedia(
  original: z.infer<typeof probeSchema>,
  encoded: z.infer<typeof probeSchema>,
  ratio: number,
  vmaf: number,
): void {
  const videos = encoded.streams.filter(
    (stream) => stream.codec_type === 'video',
  );
  if (
    encoded.streams.length !== 2 ||
    videos.length !== 1 ||
    encoded.streams.filter((stream) => stream.codec_type === 'audio').length !==
      1
  )
    throw new Error('Expected exactly one video and one audio stream');
  if (
    Math.min(videos[0]!.width ?? 0, videos[0]!.height ?? 0) !== 720 ||
    Math.abs(original.format.duration - encoded.format.duration) > 0.1 ||
    ratio > 0.5 ||
    !Number.isFinite(vmaf) ||
    vmaf < 93
  )
    throw new Error('Reencoded video failed quality validation');
  if (
    videos[0]!.avg_frame_rate !==
    original.streams.find((stream) => stream.codec_type === 'video')
      ?.avg_frame_rate
  )
    throw new Error('Frame rate changed');
}
async function verify(directory: string) {
  const originalPath = join(directory, 'video.mp4');
  const encodedPath = join(directory, 'encoded.mp4');
  const original = await probe(originalPath);
  const encoded = await probe(encodedPath);
  const quality = await runProcess(resolveVideoFfmpegPath(), [
    '-i',
    encodedPath,
    '-i',
    originalPath,
    '-lavfi',
    '[0:v]setpts=PTS-STARTPTS[d];[1:v]scale=trunc(iw*720/min(iw\\,ih)/2)*2:trunc(ih*720/min(iw\\,ih)/2)*2,setpts=PTS-STARTPTS[r];[d][r]libvmaf',
    '-an',
    '-f',
    'null',
    '-',
  ]);
  const vmaf = Number(/VMAF score:\s*([\d.]+)/.exec(quality.stderr)?.[1]);
  validateReencodedMedia(
    original,
    encoded,
    (await stat(encodedPath)).size / (await stat(originalPath)).size,
    vmaf,
  );
  return { vmaf, original, encoded };
}
async function encode(candidate: Candidate, directory: string) {
  await mkdir(directory, { recursive: true });
  const r2 = createR2ClientFromEnv();
  for (const file of files)
    await downloadR2Object(
      r2,
      getRequiredEnv('R2_BUCKET_NAME'),
      `${candidate.r2_prefix}/${file}`,
      join(directory, file),
    );
  const original = await probe(join(directory, 'video.mp4'));
  const video = original.streams.find(
    (stream) => stream.codec_type === 'video',
  );
  const [numerator, denominator] = (video?.avg_frame_rate ?? '')
    .split('/')
    .map(Number);
  const fps = numerator! / denominator!;
  if (!Number.isFinite(fps) || fps <= 0) throw new Error('Invalid source fps');
  await runProcess(resolveVideoFfmpegPath(), [
    '-n',
    '-i',
    join(directory, 'video.mp4'),
    '-map',
    '0:v:0',
    '-map',
    '0:a:0',
    '-vf',
    'scale=trunc(iw*720/min(iw\\,ih)/2)*2:trunc(ih*720/min(iw\\,ih)/2)*2',
    ...videoCodecArgs(fps, X264_CRF),
    '-c:a',
    'copy',
    '-movflags',
    '+faststart',
    join(directory, 'encoded.mp4'),
  ]);
  await writeFile(
    join(directory, 'verification.json'),
    JSON.stringify(await verify(directory), null, 2),
    { flag: 'wx' },
  );
}
async function apply(candidate: Candidate, directory: string, journal: string) {
  await verify(directory);
  const hash = createHash('sha256')
    .update(await readFile(join(directory, 'encoded.mp4')))
    .digest('hex');
  const leaf = `720p-${hash}`;
  const oldLeaf = candidate.r2_prefix.split('/').at(-1)!;
  if (leaf.startsWith(oldLeaf))
    throw new Error('New leaf overlaps original prefix');
  const parts = candidate.r2_prefix.split('/');
  const expected = [...parts.slice(0, -1), leaf].join('/');
  const uploaded = await uploadVideoArtifactsToR2({
    episodeId: parts[1]!,
    languageCode: z.enum(['zh-Hant', 'en', 'ja']).parse(parts[3]),
    rendererVersion: parts[5]!,
    manifestHash: leaf,
    videoPath: join(directory, 'encoded.mp4'),
    thumbnailPath: join(directory, 'thumbnail.png'),
    manifestPath: join(directory, 'manifest.json'),
    captionsPath: join(directory, 'captions.ass'),
  });
  if (uploaded.r2Prefix !== expected)
    throw new Error('Unexpected upload prefix');
  const next = {
    mp4_url: uploaded.mp4Url,
    thumbnail_url: uploaded.thumbnailUrl,
    manifest_url: uploaded.manifestUrl,
    captions_ass_url: uploaded.captionsAssUrl,
    r2_prefix: uploaded.r2Prefix,
    updated_at: new Date().toISOString(),
  };
  // Persist intent before the DB write, including recovery information for a lost response.
  await appendFile(
    journal,
    `${JSON.stringify({ event: 'reencode:prepared', id: candidate.episode_localization_id, old: candidate, next })}\n`,
  );
  await switchVideoUrls(candidate.episode_localization_id, candidate, next);
  await appendFile(
    journal,
    `${JSON.stringify({ event: 'reencode:applied', id: candidate.episode_localization_id, old: candidate, next })}\n`,
  );
}
export async function runVideoReencodeCli(argv: string[]): Promise<void> {
  const parsed = parseFlagArgs(argv);
  assertOnlyKnownFlags(
    parsed,
    ['work-dir', 'min-kbps'],
    'Usage: videos:reencode plan|encode|apply|rollback --work-dir PATH [--min-kbps 2000]',
  );
  if (
    !['plan', 'encode', 'apply', 'rollback'].includes(parsed.command ?? '') ||
    typeof parsed.flags['work-dir'] !== 'string'
  )
    throw new Error('Invalid reencode invocation');
  const directory = resolve(parsed.flags['work-dir']);
  const base = getRequiredEnv('R2_PUBLIC_BASE_URL');
  const planPath = join(directory, 'plan.json');
  if (parsed.command === 'plan') {
    const min =
      parsed.flags['min-kbps'] === undefined
        ? 2000
        : Number(parsed.flags['min-kbps']);
    if (
      typeof parsed.flags['min-kbps'] === 'boolean' ||
      !Number.isFinite(min) ||
      min <= 0
    )
      throw new Error('Invalid --min-kbps');
    const candidates = await readReencodePlan(min, base);
    await mkdir(directory, { recursive: true });
    await writeFile(planPath, JSON.stringify(candidates, null, 2), {
      flag: 'wx',
    });
    console.log(
      JSON.stringify({
        event: 'reencode:plan',
        count: candidates.length,
        bytes: candidates.reduce((sum, row) => sum + row.bytes, 0),
        planPath,
      }),
    );
    return;
  }
  if (parsed.flags['min-kbps'] !== undefined)
    throw new Error('--min-kbps is only valid for plan');
  if (parsed.command === 'rollback') return rollback(directory, base);
  const candidates = z
    .array(candidateSchema)
    .parse(JSON.parse(await readFile(planPath, 'utf8')));
  const ffmpeg = resolveVideoFfmpegPath();
  const encoders = await runProcess(ffmpeg, ['-encoders']);
  const filters = await runProcess(ffmpeg, ['-filters']);
  if (
    !encoders.stdout.includes('libx264') ||
    !filters.stdout.includes('libvmaf')
  )
    throw new Error('ffmpeg requires libx264 and libvmaf');
  for (const candidate of candidates) {
    validateReencodeCandidate(candidate, base);
    const work = join(directory, candidate.episode_localization_id);
    await (parsed.command === 'encode'
      ? encode(candidate, work)
      : apply(candidate, work, join(directory, 'journal.jsonl')));
  }
}
if (isMainModule(import.meta.url))
  runCli(() => runVideoReencodeCli(process.argv.slice(2)));

async function readReencodePlan(
  min: number,
  base: string,
): Promise<Candidate[]> {
  const candidates: Candidate[] = [];
  const db = getPipelineSupabase();
  const r2 = createR2ClientFromEnv();
  let cursor: string | undefined;
  for (;;) {
    let query = db
      .from('episode_videos')
      .select(
        'episode_localization_id,status,r2_prefix,mp4_url,thumbnail_url,manifest_url,captions_ass_url,duration_seconds',
      )
      .eq('status', 'completed')
      .order('episode_localization_id')
      .limit(500);
    if (cursor) query = query.gt('episode_localization_id', cursor);
    const { data, error } = await query;
    if (error) throwSupabaseError(error);
    if (!Array.isArray(data)) throw new Error('Incomplete video read');
    if (!data.length) break;
    for (const value of data) {
      const row = rowSchema.parse(value);
      validateReencodeCandidate(row, base);
      const head = await r2.send(
        new HeadObjectCommand({
          Bucket: getRequiredEnv('R2_BUCKET_NAME'),
          Key: `${row.r2_prefix}/video.mp4`,
        }),
      );
      const bytes = head.ContentLength;
      if (!bytes || bytes <= 0) throw new Error('Invalid source size');
      const kbps = (bytes * 8) / row.duration_seconds / 1000;
      if (kbps > min) candidates.push({ ...row, bytes, kbps });
    }
    const next = rowSchema.parse(data.at(-1)).episode_localization_id;
    if (cursor && next <= cursor) throw new Error('Invalid video cursor');
    cursor = next;
  }

  return candidates;
}

const urlsSchema = z.object({
  mp4_url: z.string(),
  thumbnail_url: z.string(),
  manifest_url: z.string(),
  captions_ass_url: z.string(),
  r2_prefix: z.string(),
});
type VideoUrls = z.infer<typeof urlsSchema>;
async function switchVideoUrls(
  id: string,
  expected: Pick<VideoUrls, 'mp4_url' | 'r2_prefix'>,
  next: VideoUrls,
) {
  const { data, error } = await getPipelineSupabase()
    .from('episode_videos')
    .update({ ...next, updated_at: new Date().toISOString() })
    .eq('episode_localization_id', id)
    .eq('status', 'completed')
    .eq('r2_prefix', expected.r2_prefix)
    .eq('mp4_url', expected.mp4_url)
    .select('episode_localization_id');
  if (error) throwSupabaseError(error);
  if (data?.length !== 1)
    throw new Error('Conditional video update did not affect exactly one row');
}
async function rollback(directory: string, base: string) {
  const journal = join(directory, 'journal.jsonl');
  const entries = new Map<string, { old: Candidate; next: VideoUrls }>();
  for (const line of (await readFile(journal, 'utf8'))
    .split('\n')
    .filter(Boolean)) {
    const value = z
      .object({
        event: z.enum([
          'reencode:prepared',
          'reencode:applied',
          'reencode:rolled-back',
        ]),
        id: z.string().uuid(),
        old: candidateSchema,
        next: urlsSchema,
      })
      .parse(JSON.parse(line));
    if (value.event === 'reencode:applied') entries.set(value.id, value);
    if (value.event === 'reencode:rolled-back') entries.delete(value.id);
  }
  const r2 = createR2ClientFromEnv();
  for (const [id, entry] of entries) {
    if (id !== entry.old.episode_localization_id)
      throw new Error('Journal identity mismatch');
    validateReencodeCandidate(entry.old, base);
    // Refuse restoration after GC has removed any original artifact.
    for (const file of files)
      await r2.send(
        new HeadObjectCommand({
          Bucket: getRequiredEnv('R2_BUCKET_NAME'),
          Key: `${entry.old.r2_prefix}/${file}`,
        }),
      );
    const oldUrls = urlsSchema.parse(entry.old);
    await switchVideoUrls(id, entry.next, oldUrls);
    await appendFile(
      journal,
      `${JSON.stringify({ event: 'reencode:rolled-back', id, old: entry.old, next: entry.next })}\n`,
    );
  }
}
