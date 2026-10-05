import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'darwin')
  throw new Error('Render on macOS for Hiragino and PingFang fonts.');
const server = await createServer({ root, server: { port: 0, open: false } });
await server.listen();
const browser = await chromium.launch();
try {
  const { storyFor } = await server.ssrLoadModule('/src/story/localized.ts');
  const { ogCardHtml, ogFingerprint } =
    await server.ssrLoadModule('/src/site/og.ts');
  const favicon = await readFile(path.join(root, 'public/favicon.svg'));
  const manifest = {};
  await mkdir(path.join(root, 'public/og'), { recursive: true });
  for (const locale of ['ja', 'en', 'zh-Hant']) {
    const story = storyFor(locale);
    const page = await browser.newPage({
      viewport: { width: 1200, height: 630 },
      deviceScaleFactor: 1,
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.setContent(ogCardHtml(story));
    await page.evaluate(() => document.fonts.ready);
    await page.locator('header img').evaluate((img) => img.decode());
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll('h1,p,footer span')].some(
        (el) =>
          el.scrollWidth > el.clientWidth ||
          el.getBoundingClientRect().bottom > (el.closest('main') ? 500 : 630),
      ),
    );
    if (overflow) throw new Error(`${locale}: OG text overflow`);
    await page.screenshot({
      path: path.join(root, 'public/og', `${locale}.png`),
    });
    manifest[locale] = createHash('sha256')
      .update(ogFingerprint(story))
      .update(favicon)
      .digest('hex');
    await page.close();
  }
  await writeFile(
    path.join(root, 'scripts/og.manifest.json'),
    JSON.stringify(manifest, null, 2) + '\n',
  );
} finally {
  await browser.close();
  await server.close();
}
