import { copyFile, mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { parseFlagArgs } from '../../lib/cli-args.js';
import { runCli } from '../../lib/cli-runner.js';
import { rasterizeConceptCard } from './rasterizer.js';

export async function runSlidePreviewCli(
  argv = process.argv.slice(2),
): Promise<string> {
  const parsed = parseFlagArgs(['preview', ...argv]);
  const headline = flag(parsed.flags['headline']) ?? 'Protocol Shift';
  const points = collectPoints(argv);
  const outputDirectory = resolve(
    flag(parsed.flags['output']) ?? './tmp/slide',
  );
  await mkdir(outputDirectory, { recursive: true });
  const paths = {
    input: join(outputDirectory, 'concept-card.json'),
    svg: join(outputDirectory, 'concept-card.svg'),
    master: join(outputDirectory, 'concept-card-master.png'),
    output: join(outputDirectory, 'card.png'),
  };
  await rasterizeConceptCard(
    {
      kicker: flag(parsed.flags['kicker']) ?? 'KEY CONCEPT',
      headline,
      points:
        points.length >= 2
          ? points.slice(0, 3)
          : ['Why the change matters', 'What happens next'],
    },
    paths,
  );
  // `card.png` is the exact media-window asset. Keep an explicit second name so
  // designers can drag it into the existing brand-frame fixture without
  // accidentally editing the generated asset itself.
  await copyFile(paths.output, join(outputDirectory, 'in-frame.png'));
  return outputDirectory;
}

function collectPoints(argv: readonly string[]): string[] {
  const points: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--point') continue;
    const value = argv[index + 1]?.trim();
    if (value) points.push(value);
    index += 1;
  }
  return points;
}

function flag(value: string | boolean | undefined): string | null {
  return typeof value === 'string' ? value.trim() || null : null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli(async () => {
    const directory = await runSlidePreviewCli();
    console.log(`Concept-card preview: ${directory}`);
  });
}
