#!/usr/bin/env node
/**
 * pnpm --filter @zapengine/kokode-ai pitch:pdf
 *
 * Builds the site, serves dist/ with `vite preview`, opens each deck at
 * 1280x720 in print media and writes one PDF page per slide to output/. Run
 * it on macOS so the Japanese text is set in Hiragino. Nothing is written
 * unless every check passes: slide count, no overflow, demo disclaimers and
 * the PDF's page count.
 */
import {
  sha256File,
  writeSidecar,
  readSourceCommit,
} from '@zapengine/media-release';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright-core';
import { preview } from 'vite';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const outDir = path.join(appRoot, 'output');
const DECKS = ['ja', 'en', 'zh-Hant'].flatMap((locale) => {
  const prefix = { ja: '', en: '/en', 'zh-Hant': '/zh' }[locale];
  return [
    { path: `${prefix}/pitch/`, file: `kokode-pitch.${locale}.pdf` },
    {
      path: `${prefix}/pitch/partner/`,
      file: `kokode-pitch-partner.${locale}.pdf`,
    },
  ];
});

if (process.platform !== 'darwin') {
  console.warn('warning: not on macOS; Japanese text will not use Hiragino.');
}

/** Runs in the page: what would break the printed deck. */
function inspectDeck() {
  const problems = [];
  const deck = document.querySelector('.deck');
  const slides = Array.from(document.querySelectorAll('.slide'));
  const total = Number(deck?.getAttribute('data-slide-total'));
  if (!Number.isInteger(total) || slides.length !== total) {
    problems.push(`${slides.length} slides, data-slide-total ${total}`);
  }
  for (const slide of slides) {
    const canvas = slide.querySelector('.slide-canvas');
    const foot = slide.querySelector('.slide-foot');
    if (!canvas || !foot) {
      problems.push(`${slide.id}: missing canvas or footer`);
      continue;
    }
    const box = canvas.getBoundingClientRect();
    const floor = foot.getBoundingClientRect().top;
    for (const el of canvas.querySelectorAll('.slide-content *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (
        r.right > box.right + 1 ||
        r.left < box.left - 1 ||
        r.top < box.top - 1 ||
        r.bottom > floor + 1
      ) {
        problems.push(
          `${slide.id}: <${el.tagName.toLowerCase()} class="${el.className}"> overflows`,
        );
        break;
      }
    }
  }
  for (const figure of document.querySelectorAll('figure[data-demo]')) {
    const needed = (figure.getAttribute('data-disclaimer') ?? '')
      .split(' ')
      .filter(Boolean);
    if (needed.length === 0) {
      problems.push(`demo ${figure.getAttribute('data-demo')}: no disclaimers`);
    }
    for (const note of needed) {
      if (!figure.querySelector(`.fig-note[data-note="${note}"]`)) {
        problems.push(
          `demo ${figure.getAttribute('data-demo')}: missing ${note}`,
        );
      }
    }
  }
  return { total: slides.length, problems };
}

/** PDF links go to the live site and are attributed to the PDF. */
function useAbsoluteLinks() {
  for (const link of document.querySelectorAll('a[data-pdf-href]')) {
    link.setAttribute('href', link.getAttribute('data-pdf-href'));
  }
}

function pdfPages(buffer) {
  return (buffer.toString('latin1').match(/\/Type\s*\/Page(?![a-z])/g) ?? [])
    .length;
}

for (const deck of DECKS)
  await rm(path.join(outDir, `${deck.file}.json`), { force: true });
const server = await preview({
  root: appRoot,
  logLevel: 'warn',
  preview: { port: 0, open: false },
});
const base = server.resolvedUrls?.local[0];
const browser = await chromium.launch();
try {
  if (!base) throw new Error('vite preview did not report a local URL');
  const results = [];
  for (const deck of DECKS) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
    });
    await page.goto(new URL(deck.path, base).toString(), {
      waitUntil: 'networkidle',
    });
    await page.emulateMedia({ media: 'print' });
    await page.evaluate(() => document.fonts.ready.then(() => true));
    const { total, problems } = await page.evaluate(inspectDeck);
    if (problems.length > 0) {
      throw new Error(
        `${deck.path} is not printable:\n  ${problems.join('\n  ')}`,
      );
    }
    await page.evaluate(useAbsoluteLinks);
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
    });
    const pages = pdfPages(pdf);
    if (pages !== total) {
      throw new Error(
        `${deck.path}: PDF has ${pages} pages for ${total} slides`,
      );
    }
    const fingerprint = await page
      .locator('meta[name="kokode-fingerprint"]')
      .getAttribute('content');
    if (!fingerprint) throw new Error('Missing deck fingerprint');
    results.push({ ...deck, pdf, pages, fingerprint });
    await page.close();
  }
  await mkdir(outDir, { recursive: true });
  for (const { file, pdf, pages, fingerprint } of results) {
    await writeFile(path.join(outDir, file), pdf);
    await writeSidecar(path.join(outDir, `${file}.json`), {
      fingerprint,
      sha256: await sha256File(path.join(outDir, file)),
      bytes: pdf.length,
      renderedAt: new Date().toISOString(),
      sourceCommit: readSourceCommit(appRoot),
    });
    console.log(`✓ output/${file} (${pages} pages)`);
  }
} finally {
  await browser.close();
  await server.close();
}
