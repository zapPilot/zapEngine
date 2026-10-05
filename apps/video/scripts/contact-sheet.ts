/**
 * pnpm stills <video-id> [--at 0.35,0.85] [--frames 120,480]
 *
 * The look-at-it loop: bundles once, renders stills (by default two per
 * scene, at the given fractions of each scene) to out/<id>/<lang>/stills/, and tiles
 * them into out/<id>/<lang>/contact-sheet.png with scene, frame and time labels.
 * Open the sheet first, then a single still when a detail needs checking.
 */
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { renderStill } from '@remotion/renderer';
import sharp from 'sharp';

import { parseVoManifest } from '../src/timeline/manifest';
import { buildTimeline } from '../src/timeline/timeline';
import { captionVersion } from '../src/timeline/versions';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId, selectedLangs } from './lib/args';
import { prepare } from './lib/bundle';
import { contactGrid, sampleFrames } from './lib/contact-grid';
import { publicDir, videoPaths } from './lib/paths';
import { requireNarration } from './lib/vo-cache';

const TILE_WIDTH = 640;
const COLUMNS = 4;

const { values, positionals } = cliArgs(process.argv.slice(2), {
  at: { type: 'string', default: '0.35,0.85' },
  frames: { type: 'string' },
  lang: { type: 'string' },
});
const videoId = requireVideoId(positionals, videoIds);
const paths = videoPaths(videoId);
const { storyboard, captionLangs } = getVideo(videoId);
const langs = selectedLangs(captionLangs, values.lang);

const escapeXml = (text: string) =>
  text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function main() {
  const manifest = parseVoManifest(
    JSON.parse(await readFile(paths.voManifest, 'utf8')),
  );
  requireNarration(storyboard, manifest, publicDir);
  let existingServeUrl: string | undefined;
  for (const lang of langs) {
    const work = paths.versionWork(lang);
    const timeline = buildTimeline(captionVersion(storyboard, lang), manifest);
    const samples =
      values.frames === undefined
        ? sampleFrames(
            timeline.scenes,
            values.at.split(',').map(Number),
          ).flatMap((frames, index) =>
            frames.map((frame) => ({
              frame,
              scene: timeline.scenes[index]?.spec.id ?? '',
            })),
          )
        : values.frames
            .split(',')
            .map((frame) => ({ frame: Number(frame), scene: 'frame' }));

    const { serveUrl, composition, inputProps } = await prepare(
      videoId,
      lang,
      existingServeUrl,
    );
    existingServeUrl = serveUrl;
    const stillsDir = path.join(work, 'stills');
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
      console.log(`  still ${path.relative(work, file)}`);
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
    const sheet = path.join(work, 'contact-sheet.png');
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
}

await main();
