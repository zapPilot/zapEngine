import { existsSync } from 'node:fs';
import { mkdir, open, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { generateMusic, MUSIC_MODEL, SONG_COST_USD } from './openrouter-music';

export function musicOptions(takes = '2'): { takes: number } {
  const count = Number(takes);
  if (!Number.isInteger(count) || count < 1 || count > 6)
    throw new Error('Takes must be 1–6; shared hard limit $1');
  return { takes: count };
}
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
/** Generates source takes only. Selection/mastering belong to the free loop cutter. */
export async function runMusic(
  job: {
    id: string;
    prompt: string;
    root: string;
    options: ReturnType<typeof musicOptions>;
    apiKey?: string;
  },
  generate = generateMusic,
): Promise<string> {
  if (!job.apiKey?.trim()) throw new Error('OPENROUTER_API_KEY required');
  const dir = path.join(job.root, job.id, 'music');
  await mkdir(dir, { recursive: true });
  let take = 1;
  while (existsSync(path.join(dir, `take-${take}.request.json`))) take++;
  for (let index = 0; index < job.options.takes; index++, take++) {
    const lockFile = path.join(job.root, 'music-budget.lock');
    const lock = await open(lockFile, 'wx');
    try {
      const ledger = path.join(job.root, 'music-budget.json');
      const previous = existsSync(ledger)
        ? Number(JSON.parse(await readFile(ledger, 'utf8')).attempts)
        : 0;
      const attempts = reserveSong(previous);
      await writeFile(
        ledger,
        JSON.stringify({ attempts, reservedUsd: attempts * SONG_COST_USD }) +
          '\n',
      );
    } finally {
      await lock.close();
      await rm(lockFile);
    }
    const request = {
      prompt: job.prompt,
      model: MUSIC_MODEL,
      generatedAt: new Date().toISOString(),
    };
    await writeFile(
      path.join(dir, `take-${take}.request.json`),
      JSON.stringify(request, null, 2) + '\n',
      { flag: 'wx' },
    );
    // Errors stop generation immediately, while the request and reservation stay recorded.
    await writeFile(
      path.join(dir, `take-${take}.raw.mp3`),
      await generate({ apiKey: job.apiKey, prompt: job.prompt }),
    );
  }
  return `${job.id}: source takes saved to ${dir}; audition, then pnpm --filter @zapengine/video loop cut ${job.id} --take N`;
}
