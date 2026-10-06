/**
 * pnpm capture <video-id> [--base-url https://…] [--only shot,shot]
 *
 * Photographs the live product for a video's shot list (src/videos/<id>/shots.ts)
 * and measures every target element. Each shot asserts the claims it shows;
 * one failed check aborts the run and nothing is written, so a broken page can
 * never end up in the video.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { type Browser, chromium, type Page } from 'playwright-core';
import sharp from 'sharp';

import {
  type CapturedShot,
  type CaptureManifest,
  parseCaptureManifest,
} from '../src/captures/manifest';
import type { ShotSet, ShotSpec } from '../src/captures/types';
import { getShots, videoIds } from '../src/videos/catalog';
import { cliArgs, requireVideoId } from './lib/args';
import { evaluateCheck } from './lib/capture-checks';
import { publicDir, videoPaths } from './lib/paths';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TIMEOUT_MS = 60_000;

const { values, positionals } = cliArgs(process.argv.slice(2), {
  'base-url': { type: 'string', default: 'https://www.zap-pilot.org' },
  only: { type: 'string' },
});
const videoId = requireVideoId(positionals, videoIds);
const set = getShots(videoId);
const paths = videoPaths(videoId);
const url = new URL(set.path, values['base-url']).toString();
const only = values.only?.split(',').map((id) => id.trim());

async function measure(page: Page, selector: string): Promise<Box> {
  const box = await page.locator(selector).first().boundingBox();
  if (box === null) throw new Error(`${selector} is not visible`);
  return box;
}

async function runChecks(page: Page, spec: ShotSpec) {
  const passed: string[] = [];
  const failures: string[] = [];
  const recorded: Record<string, string> = {};
  for (const check of spec.checks) {
    const locator = page.locator(check.selector).first();
    const outcome = evaluateCheck(check, {
      text: await locator.innerText(),
      value: check.value === undefined ? null : await locator.inputValue(),
      pressed: await locator.getAttribute('aria-pressed'),
    });
    passed.push(...outcome.passed);
    failures.push(...outcome.failures);
    Object.assign(recorded, outcome.values);
  }
  return { passed, failures, recorded };
}

async function shoot(
  browser: Browser,
  shotSet: ShotSet,
  id: string,
  spec: ShotSpec,
): Promise<{ shot: CapturedShot; image: Buffer }> {
  const page = await browser.newPage({
    viewport: shotSet.viewport,
    deviceScaleFactor: shotSet.deviceScaleFactor,
    colorScheme: 'dark',
  });
  page.setDefaultTimeout(TIMEOUT_MS);
  try {
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.locator(shotSet.ready).first().waitFor();
    for (const step of spec.steps ?? []) {
      if ('click' in step) await page.locator(step.click).first().click();
      else if ('focus' in step) await page.locator(step.focus).first().focus();
      else await page.locator(step.waitFor).first().waitFor();
    }
    await page.evaluate('document.fonts.ready.then(() => true)');

    const { passed, failures, recorded } = await runChecks(page, spec);
    if (failures.length > 0) {
      throw new Error(`Shot "${id}" failed:\n  ${failures.join('\n  ')}`);
    }

    // Scroll first so every box below is measured in the final layout.
    const anchor =
      spec.frame.kind === 'viewport'
        ? spec.frame.scrollTo
        : spec.frame.selector;
    const anchorBox = await measure(page, anchor);
    const scrollY = Number(await page.evaluate('window.scrollY'));
    const offset = spec.frame.kind === 'viewport' ? spec.frame.offset : 0;
    await page.evaluate(
      `window.scrollTo(0, ${Math.max(0, scrollY + anchorBox.y - offset)})`,
    );
    await page.waitForTimeout(300);

    let origin = { x: 0, y: 0 };
    let size = { ...shotSet.viewport };
    let clip: Box | undefined;
    if (spec.frame.kind === 'element') {
      const box = await measure(page, spec.frame.selector);
      const top = Number(await page.evaluate('window.scrollY'));
      const pad = spec.frame.padding;
      origin = { x: box.x - pad, y: box.y - pad };
      size = { width: box.width + pad * 2, height: box.height + pad * 2 };
      clip = { x: origin.x, y: top + origin.y, ...size };
    }

    const targets: Record<string, Box> = {};
    for (const [name, selector] of Object.entries(spec.targets)) {
      const box = await measure(page, selector);
      targets[name] = {
        x: box.x - origin.x,
        y: box.y - origin.y,
        width: box.width,
        height: box.height,
      };
    }

    const png = await page.screenshot({
      type: 'png',
      animations: 'disabled',
      caret: 'hide',
      ...(clip === undefined ? {} : { clip, fullPage: true }),
    });
    const image = await sharp(png).webp({ quality: 90, effort: 5 }).toBuffer();
    return {
      image,
      shot: {
        file: `${paths.capturePublic}/${id}.webp`,
        width: size.width,
        height: size.height,
        deviceScaleFactor: shotSet.deviceScaleFactor,
        targets,
        values: recorded,
        checks: passed,
      },
    };
  } finally {
    await page.close();
  }
}

async function previousShots(): Promise<CaptureManifest['shots']> {
  try {
    return parseCaptureManifest(
      JSON.parse(await readFile(paths.captureManifest, 'utf8')),
    ).shots;
  } catch {
    return {};
  }
}

async function main() {
  const wanted = Object.entries(set.shots).filter(
    ([id]) => only === undefined || only.includes(id),
  );
  if (wanted.length === 0)
    throw new Error(`No shots match --only ${values.only}`);

  const browser = await chromium.launch();
  const results: [string, { shot: CapturedShot; image: Buffer }][] = [];
  try {
    for (const [id, spec] of wanted) {
      console.log(`capture ${videoId}/${id} …`);
      results.push([id, await shoot(browser, set, id, spec)]);
    }
  } finally {
    await browser.close();
  }

  await mkdir(path.join(publicDir, paths.capturePublic), { recursive: true });
  for (const [, { shot, image }] of results) {
    await writeFile(path.join(publicDir, shot.file), image);
  }
  const shots = only === undefined ? {} : await previousShots();
  for (const [id, { shot }] of results) shots[id] = shot;
  const manifest: CaptureManifest = {
    videoId,
    url,
    capturedAt: new Date().toISOString(),
    shots: Object.fromEntries(
      Object.keys(set.shots)
        .filter((id) => shots[id] !== undefined)
        .map((id) => [id, shots[id] as CapturedShot]),
    ),
  };
  await writeFile(
    paths.captureManifest,
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  for (const [id, { shot }] of results) {
    console.log(
      `✓ ${id}: ${shot.checks.length} checks, ${JSON.stringify(shot.values)}`,
    );
  }
}

await main();
