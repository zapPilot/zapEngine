import path from 'node:path';

import { musicLibrary } from '../src/music/library';
import {
  LOOP_IDS,
  LOOP_SPECS,
  type LoopSpec,
  type LoopSpecId,
} from '../src/music/specs';
import { cliArgs, requireVideoId } from './lib/args';
import { musicOptions, runMusic } from './lib/music-job';
import { workspaceRoot } from './lib/paths';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  takes: { type: 'string', default: '2' },
});
const id = requireVideoId(positionals, LOOP_IDS) as LoopSpecId;
const spec: LoopSpec = LOOP_SPECS[id];
const cut: Partial<Record<LoopSpecId, { source: { prompt: string } }>> =
  musicLibrary;
const prompt = spec.prompt ?? cut[id]?.source.prompt;
if (prompt === undefined) throw new Error(`${id}: no generation prompt`);
const options = musicOptions(values.takes);
console.log(
  `${id}: ${options.takes} source takes, estimate $${(options.takes * 0.08).toFixed(2)}; shared $1 cap including failures`,
);
console.log(
  await runMusic({
    id,
    prompt,
    root: path.join(workspaceRoot, 'out'),
    options,
    apiKey: process.env['OPENROUTER_API_KEY'],
  }),
);
