// Normalizes every file in `sources/` into a 256x256 transparent PNG under
// `assets/`. Run by hand after adding or replacing a source; the output is
// committed, so `build` never needs sharp or resvg and CI never rasterizes.
//
//   node scripts/rasterize.mjs
//
// 256px covers a 44pt mark on a @3x screen with headroom. PNG is the only
// runtime format: React Native resolves it without a platform shim, and the
// landing page's static export serves the bytes untouched.

import { Resvg } from '@resvg/resvg-js';
import { readdir, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.join(import.meta.dirname, '..');
const SOURCES = path.join(ROOT, 'sources');
const ASSETS = path.join(ROOT, 'assets');
const SIZE = 256;

// Marks whose only published form is the light-mode (black-on-transparent)
// variant. The product surfaces are dark, so the black would render invisible.
const INVERT_TO_LIGHT = new Set(['protocols/ondo']);

const RASTER_EXTENSIONS = new Set(['.png', '.webp', '.jpg', '.jpeg']);

async function renderSvg(file) {
  const resvg = new Resvg(await readFile(file, 'utf8'), {
    fitTo: { mode: 'width', value: SIZE },
    background: 'rgba(0,0,0,0)',
  });
  return resvg.render().asPng();
}

async function normalize(buffer, { invert }) {
  const pipeline = sharp(buffer).resize(SIZE, SIZE, {
    fit: 'contain',
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  });
  // `negate` without alpha keeps the mark's silhouette and only flips its ink.
  return (invert ? pipeline.negate({ alpha: false }) : pipeline)
    .png()
    .toBuffer();
}

async function rasterizeCategory(category) {
  const sourceDir = path.join(SOURCES, category);
  const outputDir = path.join(ASSETS, category);
  await mkdir(outputDir, { recursive: true });

  const entries = (await readdir(sourceDir)).sort();
  for (const entry of entries) {
    const extension = path.extname(entry).toLowerCase();
    const key = path.basename(entry, extension);
    const source = path.join(sourceDir, entry);

    let rendered;
    if (extension === '.svg') {
      rendered = await renderSvg(source);
    } else if (RASTER_EXTENSIONS.has(extension)) {
      rendered = await readFile(source);
    } else {
      throw new Error(`Unsupported source format: ${category}/${entry}`);
    }

    const output = path.join(outputDir, `${key}.png`);
    await writeFile(
      output,
      await normalize(rendered, {
        invert: INVERT_TO_LIGHT.has(`${category}/${key}`),
      }),
    );
    console.log(`${category}/${key}.png  <-  ${entry}`);
  }
}

for (const category of ['chains', 'tokens', 'protocols']) {
  await rasterizeCategory(category);
}
