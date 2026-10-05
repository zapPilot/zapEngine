#!/usr/bin/env node
/**
 * pnpm sales:render <product>
 *
 * Human-facing sales artifact refresh: rebuild every PDF and video for one
 * product from existing assets. This is a render/build command, not a
 * generation command:
 *
 * - Allowed: pnpm workspace scripts that read the local filesystem
 *   (HTML → PDF, Remotion → MP4, Chromium/Playwright, ffmpeg).
 * - Forbidden: voiceover/music/make generation, paid/cloud LLM or media
 *   APIs, Infisical. Missing or stale generated inputs fail closed with an
 *   explicit pointer to the paid command; they are never run automatically.
 */
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getProduct } from './sales-registry.mjs';

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const VIDEO_FILTER = '@zapengine/video';
const VIDEO_OUT_DIR = 'apps/video/out';

/**
 * First positional argument (skips a forwarded literal `--`).
 * @param {string[]} argv
 * @returns {string | undefined}
 */
export function parseProductName(argv) {
  return argv.filter((arg) => arg !== '--')[0];
}

/**
 * Ordered free-only build steps for a product: PDF first, then one
 * freshness gate plus one render per video.
 * @param {string} productName
 * @returns {Array<{ kind: string, title: string, cmd: string, args: string[], videoId?: string }>}
 */
export function buildSteps(productName) {
  const entry = getProduct(productName);
  const steps = [];
  if (entry.pdf !== null) {
    steps.push({
      kind: 'pdf',
      title: `PDF (${entry.pdf.filter} ${entry.pdf.script})`,
      cmd: 'pnpm',
      args: ['--filter', entry.pdf.filter, entry.pdf.script],
    });
  }
  for (const videoId of entry.videos) {
    steps.push({
      kind: 'video-check',
      title: `check ${videoId}`,
      cmd: 'pnpm',
      // --silent keeps a failed gate to the script's own actionable
      // message; pnpm's echo and error summary would only bury it.
      args: ['--silent', '--filter', VIDEO_FILTER, 'check', videoId],
      videoId,
    });
    steps.push({
      kind: 'video-render',
      title: `render ${videoId}`,
      cmd: 'pnpm',
      args: ['--filter', VIDEO_FILTER, 'render', videoId],
      videoId,
    });
  }
  return steps;
}

/**
 * Basenames in a repo-relative output dir matching a pattern, sorted.
 * Discovery only: the renderers own what they produce.
 */
export function discoverArtifacts(relativeOutDir, pattern) {
  let names;
  try {
    names = readdirSync(path.join(repoRoot, relativeOutDir));
  } catch {
    return [];
  }
  return names.filter((name) => pattern.test(name)).sort();
}

/**
 * @param {string} label
 * @param {string[]} pdfFiles
 * @param {string[]} videoFiles
 */
export function formatSummary(label, pdfFiles, videoFiles) {
  const lines = [`${label} sales artifacts`, ''];
  if (pdfFiles.length > 0) {
    lines.push('PDF', ...pdfFiles.map((file) => `✓ ${file}`), '');
  }
  if (videoFiles.length > 0) {
    lines.push('Video', ...videoFiles.map((file) => `✓ ${file}`), '');
  }
  const total = pdfFiles.length + videoFiles.length;
  lines.push(
    `${total} artifact${total === 1 ? '' : 's'} rendered.`,
    'No paid generation APIs were called.',
  );
  return lines.join('\n');
}

function runQuiet(step) {
  return spawnSync(step.cmd, step.args, {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runLoud(step) {
  console.log(`── ${step.title}`);
  const result = spawnSync(step.cmd, step.args, {
    cwd: repoRoot,
    stdio: 'inherit',
  });
  return result.status ?? 1;
}

function usage() {
  return `usage: pnpm sales:render <product>\nproducts: kokode, zap-pilot`;
}

async function main() {
  let productName;
  try {
    productName = parseProductName(process.argv.slice(2));
    getProduct(productName);
  } catch {
    console.error(usage());
    process.exit(2);
  }
  const entry = getProduct(productName);
  const steps = buildSteps(productName);

  for (const step of steps) {
    if (step.kind === 'video-check') {
      const result = runQuiet(step);
      if ((result.status ?? 1) !== 0) {
        console.error(`✗ ${entry.label} video cannot be rendered.`);
        console.error('');
        const detail = [result.stdout, result.stderr]
          .filter((part) => typeof part === 'string' && part.trim() !== '')
          .join('\n')
          .trim();
        if (detail !== '') console.error(detail);
        console.error('');
        console.error('Note: voiceover/music regeneration may use a paid API');
        console.error('and is never run automatically.');
        process.exit(result.status ?? 1);
      }
      console.log(`✓ ${step.videoId}: narration fresh, music present`);
    } else if (step.kind === 'pdf') {
      const status = runLoud(step);
      if (status !== 0) {
        console.error(`✗ ${entry.label} PDF cannot be rendered.`);
        process.exit(status);
      }
    } else {
      const status = runLoud(step);
      if (status !== 0) {
        console.error(`✗ ${entry.label} video cannot be rendered.`);
        process.exit(status);
      }
    }
  }

  const pdfFiles =
    entry.pdf === null ? [] : discoverArtifacts(entry.pdf.outDir, /\.pdf$/);
  const videoFiles = entry.videos.flatMap((videoId) =>
    discoverArtifacts(
      `${VIDEO_OUT_DIR}/${videoId}`,
      new RegExp(`^${videoId}\\..*\\.mp4$`),
    ),
  );
  console.log('');
  console.log(formatSummary(entry.label, pdfFiles, videoFiles));
}

const invokedAsScript =
  typeof process.argv[1] === 'string' &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedAsScript) {
  await main();
}
