/**
 * pnpm render <video-id>
 *
 * Renders each deliverable out/<id>/<id>.<lang>.mp4 (1080p H.264 + AAC), then corrects the
 * mix to −16 LUFS / −1.5 dBTP and prints the numbers a reviewer checks:
 * duration, size, loudness. Refuses to render while any narration line is
 * still an estimate.
 */
import { mkdir, readFile, rm, stat } from 'node:fs/promises';
import path from 'node:path';

import { renderMedia, renderStill } from '@remotion/renderer';
import {
  fingerprintOf,
  readSourceCommit,
  sha256File,
  writeSidecar,
} from '@zapengine/media-release';

import { parseVoManifest } from '../src/timeline/manifest';
import { buildTimeline } from '../src/timeline/timeline';
import { captionVersion } from '../src/timeline/versions';
import { getVideo, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId, selectedLangs } from './lib/args';
import { loudnormFilter, parseLoudnorm } from './lib/audio';
import { prepare } from './lib/bundle';
import { ffmpeg, mediaDuration } from './lib/media';
import { publicDir, videoPaths } from './lib/paths';
import { posterFrame } from './lib/poster';
import { requireNarration } from './lib/vo-cache';

const { values, positionals } = cliArgs(process.argv.slice(2), {
  lang: { type: 'string' },
});
const videoId = requireVideoId(positionals, videoIds);
const paths = videoPaths(videoId);
const { storyboard, captionLangs, fingerprintSource } = getVideo(videoId);
const langs = selectedLangs(captionLangs, values.lang);

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
  requireNarration(storyboard, manifest, publicDir);
  await mkdir(paths.work, { recursive: true });
  let existingServeUrl: string | undefined;
  for (const lang of langs) {
    const raw = path.join(paths.work, `raw.${lang}.mp4`);
    const video = paths.videoFile(lang);
    const poster = video.replace(/\.mp4$/, '.poster.jpg');
    await rm(`${video}.json`, { force: true });
    await rm(`${poster}.json`, { force: true });
    const { serveUrl, composition, inputProps } = await prepare(
      videoId,
      lang,
      existingServeUrl,
    );
    existingServeUrl = serveUrl;
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
      video,
    ]);

    const final = await loudness(video);
    const seconds = await mediaDuration(video);
    const { size } = await stat(video);
    console.log(
      [
        `✓ ${path.relative(process.cwd(), video)}`,
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
    // The deliverable is written; the pre-correction intermediate has served
    // its purpose (loudness measurement). A failed render keeps it for
    // debugging.
    await rm(raw, { force: true });
    const fingerprint =
      fingerprintSource === undefined
        ? undefined
        : fingerprintOf(fingerprintSource(lang));
    const sourceCommit = readSourceCommit(process.cwd());
    const renderedAt = new Date().toISOString();
    await writeSidecar(`${video}.json`, {
      fingerprint,
      sha256: await sha256File(video),
      bytes: size,
      durationSeconds: seconds,
      renderedAt,
      sourceCommit,
    });
    if (storyboard.poster) {
      const frame = posterFrame(
        buildTimeline(captionVersion(storyboard, lang), manifest).scenes,
        storyboard.poster,
      );
      await renderStill({
        serveUrl,
        composition: {
          ...composition,
          props: { ...composition.props, captions: false },
        },
        inputProps: { ...inputProps, captions: false },
        frame,
        imageFormat: 'jpeg',
        jpegQuality: 95,
        output: poster,
      });
      await writeSidecar(`${poster}.json`, {
        fingerprint,
        sha256: await sha256File(poster),
        bytes: (await stat(poster)).size,
        renderedAt,
        sourceCommit,
      });
    }
  }
}

await main();
