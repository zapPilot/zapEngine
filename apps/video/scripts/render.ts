/**
 * pnpm render <video-id>
 *
 * Renders the deliverable out/<id>.mp4 (1080p H.264 + AAC), then corrects the
 * mix to −16 LUFS / −1.5 dBTP and prints the numbers a reviewer checks:
 * duration, size, loudness. Refuses to render while any narration line is
 * still an estimate.
 */
import { mkdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

import { renderMedia } from '@remotion/renderer';

import { parseVoManifest } from '../src/timeline/manifest';
import { buildTimeline } from '../src/timeline/timeline';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { loudnormFilter, parseLoudnorm } from './lib/audio';
import { prepare } from './lib/bundle';
import { ffmpeg, mediaDuration } from './lib/media';
import { videoPaths } from './lib/paths';

const { positionals } = cliArgs(process.argv.slice(2), {});
const videoId = requireVideoId(positionals, videoIds);
const paths = videoPaths(videoId);
const { storyboard } = getVideo(videoId);

async function loudness(file: string) {
  return parseLoudnorm(
    await ffmpeg([
      '-i',
      file,
      '-vn',
      '-af',
      loudnormFilter(),
      '-f',
      'null',
      '-',
    ]),
  );
}

async function main() {
  const manifest = parseVoManifest(
    JSON.parse(await readFile(paths.voManifest, 'utf8')),
  );
  const { estimatedLines } = buildTimeline(storyboard, manifest);
  if (estimatedLines.length > 0) {
    throw new Error(
      `Narration missing for ${estimatedLines.join(', ')}; run pnpm voiceover ${videoId} first.`,
    );
  }

  await mkdir(paths.work, { recursive: true });
  const raw = path.join(paths.work, 'raw.mp4');
  const { serveUrl, composition, inputProps } = await prepare(videoId);
  let reported = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: 'h264',
    crf: 18,
    pixelFormat: 'yuv420p',
    // Tagged BT.709 limited range (Remotion 5's default) instead of v4's
    // untagged full-range output, so players and YouTube agree on colour.
    colorSpace: 'bt709',
    imageFormat: 'jpeg',
    jpegQuality: 95,
    audioCodec: 'aac',
    audioBitrate: '192k',
    outputLocation: raw,
    onProgress: ({ progress }) => {
      const percent = Math.floor(progress * 10) * 10;
      if (percent > reported) {
        reported = percent;
        console.log(`  render ${percent}%`);
      }
    },
  });

  const measured = await loudness(raw);
  await ffmpeg([
    '-y',
    '-i',
    raw,
    '-c:v',
    'copy',
    '-af',
    loudnormFilter(measured),
    '-ar',
    '48000',
    '-c:a',
    'aac',
    '-b:a',
    '192k',
    '-movflags',
    '+faststart',
    paths.video,
  ]);

  const final = await loudness(paths.video);
  const seconds = await mediaDuration(paths.video);
  const { size } = await stat(paths.video);
  console.log(
    [
      `✓ ${path.relative(process.cwd(), paths.video)}`,
      `  ${composition.width}x${composition.height} @ ${composition.fps}fps, ${seconds.toFixed(2)}s (limit ${storyboard.maxSeconds}s)`,
      `  ${(size / 1024 / 1024).toFixed(1)} MB`,
      `  loudness ${measured.i} → ${final.i} LUFS, true peak ${final.tp} dBTP, LRA ${final.lra}`,
    ].join('\n'),
  );
  if (seconds > storyboard.maxSeconds) {
    throw new Error(
      `Rendered ${seconds.toFixed(2)}s exceeds ${storyboard.maxSeconds}s.`,
    );
  }
}

await main();
