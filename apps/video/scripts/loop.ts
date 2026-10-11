import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { readSourceCommit } from '@zapengine/media-release';

import { loopSchema } from '../src/music/loop';
import { isLoopSpecId, LOOP_IDS, LOOP_SPECS } from '../src/music/specs';
import { cliArgs } from './lib/args';
import { cutLoop } from './lib/loop-job';
import { publicDir, workspaceRoot } from './lib/paths';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  candidates: { type: 'boolean' },
  start: { type: 'string' },
  bars: { type: 'string' },
  take: { type: 'string' },
});
const [command, id] = positionals;
if (!['cut', 'accept'].includes(command ?? '') || !isLoopSpecId(id))
  throw new Error(
    `usage: pnpm --filter @zapengine/video loop cut|accept ${LOOP_IDS.join('|')} [--candidates] [--start seconds] [--bars bars] [--take N]`,
  );
const loopId = id;
const spec = LOOP_SPECS[loopId];
const target = path.join(publicDir, 'music', `${loopId}.mp3`);
if (command === 'accept') {
  const metadata = loopSchema.parse(
    JSON.parse(await readFile(target.replace('.mp3', '.json'), 'utf8')),
  );
  const sha256 = createHash('sha256')
    .update(await readFile(target))
    .digest('hex');
  if (sha256 !== metadata.sha256) throw new Error('Clip changed since review');
  metadata.review = {
    status: 'accepted',
    acceptedAt: new Date().toISOString(),
    sha256,
  };
  await writeFile(
    target.replace('.mp3', '.json'),
    JSON.stringify(loopSchema.parse(metadata), null, 2) + '\n',
  );
} else {
  const source = path.join(
    workspaceRoot,
    'music/sources',
    `${spec.source}.mp3`,
  );
  const take = values.take;
  if (take && (!Number.isInteger(Number(take)) || Number(take) < 1))
    throw new Error('--take must be positive');
  let file = take
    ? path.join(workspaceRoot, 'out', loopId, 'music', `take-${take}.raw.mp3`)
    : source;
  // A take records its own request; a full paid source keeps its provenance beside it.
  const provenance = JSON.parse(
    await readFile(
      take
        ? file.replace('.raw.mp3', '.request.json')
        : source.replace('.mp3', '.json'),
      'utf8',
    ),
  );
  if (take && !values.candidates) {
    const hash = createHash('sha256')
      .update(await readFile(file))
      .digest('hex');
    const retained = path.join(
      workspaceRoot,
      'music/sources',
      `${loopId}.take-${take}.${hash.slice(0, 8)}.mp3`,
    );
    await copyFile(file, retained);
    file = retained;
  }
  const sourceMetadata = {
    file: path.relative(workspaceRoot, file),
    sha256: createHash('sha256')
      .update(await readFile(file))
      .digest('hex'),
    model: provenance.model,
    prompt: provenance.prompt,
    commit: take ? readSourceCommit(workspaceRoot) : 'a4c889f0f',
  };
  const work = path.join(workspaceRoot, 'out/loops', loopId);
  await mkdir(work, { recursive: true });
  const clip = values.candidates ? target : path.join(work, `${loopId}.mp3`);
  await cutLoop({
    id: loopId,
    sourceFile: file,
    sourceMetadata,
    target: clip,
    work,
    candidates: values.candidates ?? false,
    start: values.start ? Number(values.start) : undefined,
    bars: values.bars ? Number(values.bars) : undefined,
    bpm: spec.bpm,
    end: spec.end,
  });
  // Only the selected clip/provenance enter git; listening previews remain in out/.
  if (!values.candidates) {
    await writeFile(target, await readFile(clip));
    await writeFile(
      target.replace('.mp3', '.json'),
      await readFile(clip.replace('.mp3', '.json')),
    );
  }
}
