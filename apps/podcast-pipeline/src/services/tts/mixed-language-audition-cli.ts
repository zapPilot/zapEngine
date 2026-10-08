import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

import { concatMp3Buffers } from './audio-concat.js';
import { measureSilences } from './audio-trim.js';
import { synthesize } from './fish-audio.js';
import { auditionMixedLanguage } from './mixed-language-audition.js';
import { synthesizeMixedLanguage } from './mixed-language-tts.js';
import { getTtsConfig } from './tts-config.js';

const { values } = parseArgs({ options: { output: { type: 'string' } } });
const output =
  values.output ?? (await mkdtemp(join(tmpdir(), 'tts-audition-')));
await mkdir(output, { recursive: true });
const report = await auditionMixedLanguage(
  (languageCode: string) => getTtsConfig(languageCode),
  {
    synthesize,
    render: synthesizeMixedLanguage,
    measure: measureSilences,
    concat: concatMp3Buffers,
    save: async (name, audio) => {
      const file = join(output, name);
      await writeFile(file, audio);
      console.log(`afplay '${file}'`);
    },
  },
);
await writeFile(join(output, 'CHECKLIST.md'), report);
console.log(output);
