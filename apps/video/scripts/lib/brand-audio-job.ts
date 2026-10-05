import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { Storyboard } from '../../src/timeline/types';
import { VOICES } from '../../src/timeline/voices';
import {
  loudnormFilter,
  parseLoudnorm,
  silenceIntervals,
  speechSpan,
} from './audio';
import { brandProvenance } from './brand-asset';
import { synthesize } from './fish-audio';
import { MEDIA_TOOLS, type MediaTools } from './media';
import { synthesizeLine } from './speech-assemble';
import { type BrandClip, planSpeech, SPLICE_KEEP_S } from './speech-plan';

export interface BrandOptions {
  takes?: number;
  pick?: number;
  audition: boolean;
  take?: number[];
  keep: number[];
  pauseScale: number[];
  replace: boolean;
}
function numbers(
  value: string,
  min: number,
  max: number,
  integer = false,
): number[] {
  const result = value.split(',').map(Number);
  if (
    result.some(
      (n) =>
        !Number.isFinite(n) ||
        n < min ||
        n > max ||
        (integer && !Number.isInteger(n)),
    )
  )
    throw new Error(`Invalid numeric option: ${value}`);
  return result;
}
export function brandOptions(values: {
  takes?: string;
  pick?: string;
  audition?: boolean;
  take?: string;
  keep?: string;
  'pause-scale'?: string;
  replace?: boolean;
}): BrandOptions {
  if (
    [
      values.takes !== undefined,
      values.pick !== undefined,
      !!values.audition,
    ].filter(Boolean).length !== 1
  )
    throw new Error('Choose exactly one of --takes, --audition, --pick');
  const single = (value: string, max: number) => {
    const list = numbers(value, 1, max, true);
    if (list.length !== 1) throw new Error('Expected one number');
    return Number(value);
  };
  return {
    takes: values.takes === undefined ? undefined : single(values.takes, 6),
    pick:
      values.pick === undefined
        ? undefined
        : single(values.pick, Number.MAX_SAFE_INTEGER),
    audition: !!values.audition,
    take:
      values.take === undefined
        ? undefined
        : numbers(values.take, 1, Number.MAX_SAFE_INTEGER, true),
    keep: numbers(values.keep ?? String(SPLICE_KEEP_S), 0, 0.1),
    pauseScale: numbers(values['pause-scale'] ?? '1', 0.1, 2),
    replace: !!values.replace,
  };
}
const requestSchema = z.object({
  text: z.string(),
  voice: z.string(),
  referenceId: z.string(),
  engine: z.string(),
  speed: z.number(),
  generatedAt: z.iso.datetime(),
});
interface BrandJob {
  clip: BrandClip;
  id: string;
  root: string;
  publicDir: string;
  engine: string;
  apiKey?: string;
  options: BrandOptions;
  storyboard: Storyboard;
  baseline: Record<string, string>;
}
interface BrandOperations {
  synthesize: typeof synthesize;
  tools: MediaTools;
  now: () => string;
  log: (message: string) => void;
}
const OPS: BrandOperations = {
  synthesize,
  tools: MEDIA_TOOLS,
  now: () => new Date().toISOString(),
  log: console.log,
};
const hash = (bytes: Buffer | string) =>
  createHash('sha256').update(bytes).digest('hex');
async function inspect(file: string, tools: MediaTools) {
  const duration = await tools.duration(file);
  const stderr = await tools.run([
    '-i',
    file,
    '-af',
    `silencedetect=noise=-45dB:d=0.01,${loudnormFilter()}`,
    '-f',
    'null',
    '-',
  ]);
  return {
    duration,
    span: speechSpan(stderr, duration),
    loudness: parseLoudnorm(stderr),
    silences: silenceIntervals(stderr, duration),
  };
}
/** Generate immutable candidates or explicitly select bytes. Generation never selects. */
export async function runBrandAudio(
  job: BrandJob,
  ops: BrandOperations = OPS,
): Promise<string[]> {
  const { clip, options } = job;
  const dir = path.join(job.root, job.id);
  const destination = path.join(job.publicDir, clip.file);
  const takeFile = (n: number) => path.join(dir, `take-${n}.mp3`);
  if (
    (options.takes !== undefined || options.pick !== undefined) &&
    (clip.status === 'approved' || existsSync(destination)) &&
    !options.replace
  )
    throw new Error(
      'Approved clip exists; use --replace only with human authorization',
    );
  await mkdir(dir, { recursive: true });
  if (options.takes !== undefined) {
    if (!job.apiKey?.trim())
      throw new Error(
        'FISH_AUDIO_API_KEY required; use node scripts/env/run.mjs --',
      );
    let take = 1;
    while (
      existsSync(path.join(dir, `take-${take}.request.json`)) ||
      existsSync(takeFile(take))
    )
      take++;
    const files: string[] = [];
    for (let i = 0; i < options.takes; i++, take++) {
      const request = {
        text: clip.spoken,
        voice: clip.voice,
        referenceId: VOICES[clip.voice].id,
        engine: job.engine,
        speed: clip.speed,
        generatedAt: ops.now(),
      };
      await writeFile(
        path.join(dir, `take-${take}.request.json`),
        JSON.stringify(request, null, 2),
        { flag: 'wx' },
      );
      try {
        await writeFile(
          takeFile(take),
          await ops.synthesize({ ...request, apiKey: job.apiKey }),
          { flag: 'wx' },
        );
        ops.log(
          `${takeFile(take)} ${JSON.stringify(await inspect(takeFile(take), ops.tools))}`,
        );
        files.push(takeFile(take));
      } catch (error) {
        await writeFile(
          path.join(dir, `take-${take}.failed.txt`),
          String(error),
          { flag: 'wx' },
        );
        throw error;
      }
    }
    return files;
  }
  if (options.pick !== undefined) {
    const file = takeFile(options.pick);
    if (!existsSync(file)) throw new Error(`Unknown take ${options.pick}`);
    const request = requestSchema.parse(
      JSON.parse(
        await readFile(
          path.join(dir, `take-${options.pick}.request.json`),
          'utf8',
        ),
      ),
    );
    if (
      request.text !== clip.spoken ||
      request.voice !== clip.voice ||
      request.speed !== clip.speed ||
      request.referenceId !== VOICES[clip.voice].id ||
      request.engine !== job.engine
    )
      throw new Error(
        'Take differs from current brand voice/engine; regenerate',
      );
    const report = await inspect(file, ops.tools);
    if (!report.span) throw new Error('Selected take contains no speech');
    const bytes = await readFile(file);
    const provenance = brandProvenance.parse({
      spokenText: request.text,
      displayText: clip.token,
      voice: clip.voice,
      referenceId: request.referenceId,
      engine: request.engine,
      speed: request.speed,
      take: options.pick,
      durationSeconds: report.duration,
      sha256: hash(bytes),
      humanApproved: true,
      generatedAt: request.generatedAt,
    });
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes, { flag: options.replace ? 'w' : 'wx' });
    await writeFile(
      destination.replace(/\.mp3$/, '.json'),
      `${JSON.stringify(provenance, null, 2)}\n`,
      { flag: options.replace ? 'w' : 'wx' },
    );
    return [destination];
  }
  const takes =
    options.take ??
    (await readdir(dir))
      .flatMap((name) => {
        const m = /^take-(\d+)\.mp3$/.exec(name);
        return m ? [Number(m[1])] : [];
      })
      .sort((a, b) => a - b);
  if (!takes.length) throw new Error('No candidates; run --takes first');
  const fragmentDir = path.join(dir, 'fragments');
  await mkdir(fragmentDir, { recursive: true });
  const cachedSynth = async (text: string) => {
    const file = path.join(
      fragmentDir,
      `${hash(JSON.stringify([text, clip.voice, clip.speed, job.engine]))}.mp3`,
    );
    if (existsSync(file)) return readFile(file);
    if (!job.apiKey?.trim())
      throw new Error(
        'FISH_AUDIO_API_KEY required for uncached audition fragments',
      );
    const audio = await ops.synthesize({
      text,
      apiKey: job.apiKey,
      referenceId: VOICES[clip.voice].id,
      engine: job.engine,
      speed: clip.speed,
    });
    await writeFile(file, audio, { flag: 'wx' });
    return audio;
  };
  const files: string[] = [];
  const reports: string[] = [];
  for (const line of job.storyboard.scenes
    .flatMap((scene) => scene.vo)
    .filter((line) => (line.say ?? line.text).includes(clip.token))) {
    const baseline = job.baseline[line.id];
    if (baseline && existsSync(baseline))
      await writeFile(
        path.join(dir, `baseline-${line.id}.mp3`),
        await readFile(baseline),
      );
    for (const take of takes) {
      if (!existsSync(takeFile(take))) throw new Error(`Unknown take ${take}`);
      for (const keep of options.keep)
        for (const scale of options.pauseScale) {
          const target = path.join(
            dir,
            `take-${take}-${line.id}-keep-${keep}-pause-${scale}.mp3`,
          );
          const scratch = path.join(dir, 'scratch');
          await mkdir(scratch, { recursive: true });
          const plan = planSpeech(line.say ?? line.text, job.storyboard.voice, {
            [job.id]: { ...clip, status: 'approved', file: takeFile(take) },
          }).map((part) =>
            part.kind === 'pause' ? { ...part, ms: part.ms * scale } : part,
          );
          const gaps = await synthesizeLine(plan, {
            scratch,
            target,
            publicDir: job.publicDir,
            synthesize: cachedSynth,
            keep,
            tools: ops.tools,
          });
          const report = `${target}\nplanned gaps: ${JSON.stringify(gaps)}\n${JSON.stringify(await inspect(target, ops.tools))}`;
          ops.log(report);
          reports.push(report);
          files.push(target);
        }
    }
  }
  await writeFile(
    path.join(dir, 'CHECKLIST.md'),
    `# Brand audition\n\nListen to every line against baseline and the other nine lines. Check pronunciation, brand tone, pauses before/after, clicks/pops, cut-off consonants, volume and rhythm. Choose take, retention and pause scale explicitly; --pick never runs automatically.\n\n${files.map((file) => `afplay '${file}'`).join('\n')}\n\n${reports.join('\n\n')}\n`,
  );
  return files;
}
