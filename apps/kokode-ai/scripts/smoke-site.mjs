import assert from 'node:assert/strict';
import { access, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer, preview } from 'vite';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const languages = [
  { lang: 'ja', prefix: '/' },
  { lang: 'en', prefix: '/en/' },
  { lang: 'zh-Hant', prefix: '/zh/' },
];
const surfaces = ['', 'pitch/', 'pitch/partner/'];
for (const { prefix } of languages) {
  for (const surface of surfaces) {
    await access(
      path.join(root, 'dist', prefix.slice(1), surface, 'index.html'),
    );
  }
}
const dev = process.argv.includes('--dev');
const server = dev
  ? await createServer({ root, server: { port: 0, open: false } })
  : await preview({ root, preview: { port: 0, open: false } });
if (dev) await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const output = path.join(root, 'output', 'smoke');
await mkdir(output, { recursive: true });
try {
  for (const width of [375, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 800 } });
    for (const { lang, prefix } of languages) {
      for (const surface of surfaces) {
        await page.goto(new URL(prefix + surface, base).href);
        await page.locator('.lang-switch').first().waitFor();
        assert.equal(await page.locator('html').getAttribute('lang'), lang);
        assert.equal(
          await page
            .locator('.lang-switch')
            .first()
            .locator('[aria-current="true"]')
            .getAttribute('lang'),
          lang,
        );
        for (const target of languages) {
          await page.locator('.lang-switch').first().locator('summary').click();
          await page
            .locator('.lang-switch')
            .first()
            .locator(`a[lang="${target.lang}"]`)
            .click();
          assert.equal(new URL(page.url()).pathname, target.prefix + surface);
          assert.equal(
            await page.locator('html').getAttribute('lang'),
            target.lang,
          );
        }
        await page.goto(new URL(prefix + surface, base).href);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth + 1,
        );
        assert.equal(
          overflow,
          false,
          `${width}px ${prefix}${surface}: horizontal overflow`,
        );
        if (surface) {
          const cta = page.locator('a[data-cta]').first();
          await cta.click();
          const url = new URL(page.url());
          assert.equal(url.pathname, prefix);
          assert.equal(url.hash, '#contact');
          assert.equal(url.searchParams.get('utm_medium'), 'deck');
          assert.equal(url.searchParams.get('utm_source'), 'pitch');
          assert.equal(
            url.searchParams.get('utm_campaign'),
            surface.includes('partner') ? 'partner-deck' : 'doctor-deck',
          );
          if (surface.includes('partner')) {
            await page.waitForFunction(
              () =>
                document.querySelector('#interest')?.value ===
                '販売パートナーとして相談',
            );
          }
        } else {
          await page.goto(
            new URL(
              prefix +
                '?interest=partner&utm_source=smoke&utm_campaign=languages#contact',
              base,
            ).href,
          );
          await page.waitForFunction(
            () =>
              document.querySelector('#interest')?.value ===
              '販売パートナーとして相談',
          );
          assert.equal(
            new URL(page.url()).searchParams.get('utm_campaign'),
            'languages',
          );
          await page.locator('[data-interest="materials"]').first().click();
          assert.equal(
            await page.locator('#interest').inputValue(),
            '説明資料・解剖図の作成',
          );
        }
      }
    }
    await page.close();
  }
  for (const { lang, prefix } of languages.filter(
    (item) => item.lang !== 'ja',
  )) {
    for (const surface of surfaces.slice(1)) {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 720 },
      });
      await page.goto(new URL(prefix + surface, base).href);
      await page.emulateMedia({ media: 'print' });
      await page.evaluate(() => document.fonts.ready);
      const images = [];
      for (const slide of await page.locator('.slide').all()) {
        images.push((await slide.screenshot()).toString('base64'));
      }
      await page.setContent(
        `<style>body{margin:0;background:#ddd;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}img{width:100%}</style>${images.map((data) => `<img src="data:image/png;base64,${data}">`).join('')}`,
      );
      await page.screenshot({
        path: path.join(
          output,
          `${lang}-${surface.includes('partner') ? 'partner' : 'pitch'}.png`,
        ),
        fullPage: true,
      });
      await page.close();
    }
  }
  console.log(
    `✓ ${dev ? 'dev' : 'built'}: nine pages, three language links, 375px/1280px, interest and UTM; four contact sheets`,
  );
} finally {
  await browser.close();
  await server.close();
}
