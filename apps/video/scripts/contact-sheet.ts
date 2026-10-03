/**
 * pnpm stills <video-id> [--at 0.35,0.85] [--frames 120,480]
 *
 * The look-at-it loop: bundles once, renders stills (by default two per
 * scene, at the given fractions of each scene) to out/<id>/stills/, and tiles
 * them into out/<id>/contact-sheet.png with scene, frame and time labels.
 * Open the sheet first, then a single still when a detail needs checking.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { renderStill } from '@remotion/renderer';
import sharp from 'sharp';

import { parseVoManifest } from '../src/timeline/manifest';
import { buildTimeline } from '../src/timeline/timeline';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { prepare } from './lib/bundle';
import { contactGrid, sampleFrames } from './lib/contact-grid';
import { videoPaths } from './lib/paths';

const TILE_WIDTH = 640;
const COLUMNS = 4;

const { values, positionals } = cliArgs(process.argv.slice(2), {
  at: { type: 'string', default: '0.35,0.85' },
  frames: { type: 'string' },
});
const videoId = requireVideoId(positionals, videoIds);
const paths = videoPaths(videoId);
const { storyboard } = getVideo(videoId);

const escapeXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function main() {
  const manifest = parseVoManifest(
    JSON.parse(await readFile(paths.voManifest, 'utf8')),
  );
  const timeline = buildTimeline(storyboard, manifest);
  const samples =
    values.frames === undefined
      ? sampleFrames(timeline.scenes, values.at.split(',').map(Number)).flatMap(
          (frames, index) =>
            frames.map((frame) => ({
              frame,
              scene: timeline.scenes[index]?.spec.id ?? '',
            })),
        )
      : values.frames
          .split(',')
          .map((frame) => ({ frame: Number(frame), scene: 'frame' }));

  const { serveUrl, composition, inputProps } = await prepare(videoId);
  const stillsDir = path.join(paths.work, 'stills');
  await mkdir(stillsDir, { recursive: true });

  const rendered: { file: string; label: string }[] = [];
  for (const { frame, scene } of samples) {
    const file = path.join(
      stillsDir,
      `${String(frame).padStart(4, '0')}-${scene}.png`,
    );
    await renderStill({
      serveUrl,
      composition,
      inputProps,
      frame,
      output: file,
      imageFormat: 'png',
    });
    const seconds = (frame / composition.fps).toFixed(2);
    rendered.push({ file, label: `${scene} · f${frame} · ${seconds}s` });
    console.log(`  still ${path.relative(paths.work, file)}`);
  }

  const grid = contactGrid(rendered.length, COLUMNS, TILE_WIDTH);
  const layers = await Promise.all(
    rendered.map(async ({ file, label }, index) => {
      const tile = grid.tiles[index] as (typeof grid.tiles)[number];
      return [
        {
          input: await sharp(file)
            .resize(tile.width, tile.height)
            .png()
            .toBuffer(),
          left: tile.left,
          top: tile.top,
        },
        {
          input: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${tile.width}" height="32"><text x="2" y="24" font-family="Menlo, monospace" font-size="20" fill="#d4c5a3">${escapeXml(label)}</text></svg>`,
          ),
          left: tile.left,
          top: tile.top + tile.height + 4,
        },
      ];
    }),
  );
  const sheet = path.join(paths.work, 'contact-sheet.png');
  await sharp({
    create: {
      width: grid.width,
      height: grid.height,
      channels: 3,
      background: '#000000',
    },
  })
    .composite(layers.flat())
    .png()
    .toFile(sheet);
  console.log(`contact sheet: ${sheet}`);
}

await main();
