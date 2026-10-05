import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  open,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';

import type { Storyboard } from '../../src/timeline/types';
import {
  acceptMusic,
  inspectMusic,
  masterMusic,
  type MusicReport,
} from './music-checks';
import { generateMusic, MUSIC_MODEL, SONG_COST_USD } from './openrouter-music';

export function musicOptions(
  takes = '2',
  pick?: string,
): { takes: number; pick?: number } {
  const count = Number(takes);
  if (!Number.isInteger(count) || count < 1 || count > 6)
    throw new Error(
      `Takes must be 1–6 (estimated $${(count * SONG_COST_USD).toFixed(2)}; shared hard limit $1)`,
    );
  if (pick === undefined) return { takes: count };
  const selected = Number(pick);
  if (!Number.isInteger(selected) || selected < 1)
    throw new Error('Pick must be a positive take number');
  return { takes: count, pick: selected };
}

/** Reserve before dispatch, including failed calls; never silently reset this ledger. */
export function reserveSong(attempts: number): number {
  if (
    !Number.isInteger(attempts) ||
    attempts < 0 ||
    (attempts + 1) * SONG_COST_USD > 1
  )
    throw new Error(
      'Music generation budget exhausted ($1); inspect out/music-budget.json before authorizing more',
    );
  return attempts + 1;
}

interface Provenance {
  readonly id: string;
  readonly model: string;
  readonly prompt: string;
  readonly generatedAt: string;
  readonly take: number;
  readonly sha256: string;
  readonly report: MusicReport;
}

export function musicReadme(records: readonly Provenance[]): string {
  return `# Advertisement music\n\nSelected MP3s and their provenance JSON are source assets: keep them in Git. Takes and raw responses live in ignored \`out/\`. Generate with \`pnpm music <video-id> --takes 2\`; select with \`pnpm music <video-id> --pick N\`. Never loop a short take.\n\n## Source and terms\n\nGenerated through paid OpenRouter using Google Lyria 3 Pro Preview. Model pricing: [$0.08 per song](https://openrouter.ai/google/lyria-3-pro-preview), checked 2026-10-05. No artist, existing song or copyrighted melody was requested.\n\n[OpenRouter terms](https://openrouter.ai/terms) incorporate provider model terms. [Google Gemini API terms](https://ai.google.dev/gemini-api/terms) allow professional/business use and Google does not claim ownership of generated content; similar outputs may be generated for others. These are terms for generated output, not a separately licensed human composition. Commercial use remains subject to applicable provider terms and law. No exclusive copyright, non-infringement guarantee or exclusive license is asserted. The customer must understand these limitations before delivery.\n\n[Google's Lyria model card](https://deepmind.google/models/model-cards/lyria-3/) describes SynthID watermarking. Treat these tracks as AI-generated, SynthID-marked music; this pipeline does not independently detect the watermark. Mastering uses unseeded dynamic loudnorm (LRA target 3), followed by linear alignment to −18 LUFS with −2.5 dBTP encoding headroom to lift quiet passages, then checks the encoded MP3 against −2 dBTP. Natural rests and fades may still fall below the gap audibility target; review the mix evidence before customer delivery.\n\nObjective acceptance: duration ≥ film + 2s, leading silence ≤ 0.3s, measurable non-silent audio, approximately −18 LUFS / true peak ≤ −2 dBTP, 48 kHz stereo MP3 at 192k. Human listening is still required to judge instrumentation, absence of vocals and musical quality.\n\n| File | Model | Generated (UTC) | Take | Source |\n| --- | --- | --- | --- | --- |\n${records.map((r) => `| ${r.id}.mp3 | ${r.model} | ${r.generatedAt} | ${r.take} | Paid OpenRouter / Google |`).join('\n')}\n\n${records.map((r) => `## ${r.id}\n\nSHA-256 (selected mastered MP3): \`${r.sha256}\`\n\nExact prompt:\n\n> ${r.prompt}\n`).join('\n')}`;
}

interface MusicJob {
  readonly storyboard: Storyboard;
  readonly seconds: number;
  readonly root: string;
  readonly publicDir: string;
  readonly knownIds: readonly string[];
  readonly options: ReturnType<typeof musicOptions>;
  readonly apiKey?: string;
}
interface MusicOperations {
  readonly generate: typeof generateMusic;
  readonly master: typeof masterMusic;
  readonly inspect: typeof inspectMusic;
}
const OPERATIONS: MusicOperations = {
  generate: generateMusic,
  master: masterMusic,
  inspect: inspectMusic,
};

/** Disk-backed orchestration; --pick does not need credentials or bill a request. */
export async function runMusic(
  job: MusicJob,
  operations: MusicOperations = OPERATIONS,
): Promise<string> {
  const { storyboard, options } = job;
  const dir = path.join(job.root, storyboard.id, 'music');
  await mkdir(dir, { recursive: true });
  const takeFile = (take: number) => path.join(dir, `take-${take}.mp3`);
  let chosen = options.pick;
  if (chosen === undefined) {
    if (!job.apiKey?.trim())
      throw new Error(
        'OPENROUTER_API_KEY required; use node scripts/env/run.mjs --',
      );
    const ledgerFile = path.join(job.root, 'music-budget.json');
    let take = 1;
    while (existsSync(path.join(dir, `take-${take}.request.json`))) take++;
    for (let index = 0; index < options.takes; index++, take++) {
      const lockFile = path.join(job.root, 'music-budget.lock');
      const lock = await open(lockFile, 'wx');
      try {
        const previous = existsSync(ledgerFile)
          ? Number(JSON.parse(await readFile(ledgerFile, 'utf8')).attempts)
          : 0;
        const attempts = reserveSong(previous);
        await writeFile(
          ledgerFile,
          JSON.stringify({ attempts, reservedUsd: attempts * SONG_COST_USD }),
        );
      } finally {
        await lock.close();
        await rm(lockFile);
      }
      const raw = path.join(dir, `take-${take}.raw.mp3`);
      const request = {
        prompt: storyboard.music.prompt,
        model: MUSIC_MODEL,
        generatedAt: new Date().toISOString(),
      };
      await writeFile(
        path.join(dir, `take-${take}.request.json`),
        JSON.stringify(request, null, 2),
        { flag: 'wx' },
      );
      // Provider errors stop immediately; no substitute model or hidden network retry.
      try {
        await writeFile(
          raw,
          await operations.generate({
            apiKey: job.apiKey,
            prompt: request.prompt,
          }),
        );
      } catch (error) {
        await writeFile(
          path.join(dir, `take-${take}.failed.txt`),
          String(error),
        );
        throw error;
      }
      try {
        const report = await operations.master(
          raw,
          takeFile(take),
          job.seconds,
        );
        await writeFile(
          path.join(dir, `take-${take}.report.json`),
          JSON.stringify(report, null, 2),
        );
        chosen ??= take;
      } catch (error) {
        await writeFile(
          path.join(dir, `take-${take}.rejected.txt`),
          String(error),
        );
      }
    }
  }
  if (chosen === undefined)
    throw new Error(
      'No take passed acceptance; review rejected takes and budget before retrying',
    );
  if (existsSync(path.join(dir, `take-${chosen}.rejected.txt`)))
    throw new Error(`Take ${chosen} was rejected; generate another take`);
  const file = takeFile(chosen);
  const report = await operations.inspect(file);
  acceptMusic(report, job.seconds);
  if (Math.abs(report.loudness.i + 18) > 1 || report.loudness.tp > -2)
    throw new Error('Selected take is not a mastered music asset');
  const request = JSON.parse(
    await readFile(path.join(dir, `take-${chosen}.request.json`), 'utf8'),
  ) as { model: string; prompt: string; generatedAt: string };
  if (
    request.prompt !== storyboard.music.prompt ||
    request.model !== MUSIC_MODEL
  )
    throw new Error(
      'Take prompt/model differs from current storyboard; regenerate',
    );
  const destination = path.join(job.publicDir, storyboard.music.src);
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(file, destination);
  const record: Provenance = {
    ...request,
    id: storyboard.id,
    take: chosen,
    report,
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
  };
  await writeFile(
    destination.replace(/\.mp3$/, '.json'),
    `${JSON.stringify(record, null, 2)}\n`,
  );
  const records: Provenance[] = [];
  for (const id of job.knownIds) {
    const metadata = path.join(job.publicDir, 'music', `${id}.json`);
    if (existsSync(metadata))
      records.push(JSON.parse(await readFile(metadata, 'utf8')) as Provenance);
  }
  await writeFile(
    path.join(job.publicDir, 'music', 'README.md'),
    musicReadme(records),
  );
  return destination;
}
