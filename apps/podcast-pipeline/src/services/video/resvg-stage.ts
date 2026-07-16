import { readFile, writeFile } from 'node:fs/promises';

import { Resvg } from '@resvg/resvg-js';

export async function runResvgStage(
  inputPath: string,
  outputPath: string,
): Promise<void> {
  const svg = await readFile(inputPath, 'utf8');
  const renderer = new Resvg(svg, {
    fitTo: { mode: 'original' },
    font: { loadSystemFonts: false },
  });
  await writeFile(outputPath, renderer.render().asPng());
}
