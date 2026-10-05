import assert from 'node:assert/strict';
import test from 'node:test';

import { getProduct, PRODUCTS, productNames } from './sales-registry.mjs';

test('registry exposes exactly the supported products', () => {
  assert.deepEqual([...productNames].sort(), ['kokode', 'zap-pilot']);
});

test('getProduct returns the kokode entry with PDF and videos', () => {
  const entry = getProduct('kokode');
  assert.equal(entry.label, 'KOKODE');
  assert.deepEqual(entry.pdf, {
    filter: '@zapengine/kokode-ai',
    script: 'pitch:pdf',
    outDir: 'apps/kokode-ai/output',
  });
  assert.deepEqual(entry.videos, ['kokode-clinic']);
});

test('zap-pilot is video-only by repository truth, not by omission', () => {
  const entry = getProduct('zap-pilot');
  assert.equal(entry.pdf, null);
  assert.ok(entry.videos.length > 0);
});

test('registry never duplicates locale lists', () => {
  for (const [name, entry] of Object.entries(PRODUCTS)) {
    for (const key of ['locale', 'locales', 'lang', 'langs']) {
      assert.ok(
        !(key in entry) && !(entry.pdf !== null && key in entry.pdf),
        `${name} must not own a locale list`,
      );
    }
    assert.ok(
      entry.videos.length > 0 &&
        new Set(entry.videos).size === entry.videos.length,
      `${name} lists unique videos`,
    );
  }
});

test('getProduct rejects unknown or missing products with usage', () => {
  for (const bad of [undefined, '', 'kokode-clinic', 'calculator-pitch']) {
    assert.throws(() => getProduct(bad), /Expected exactly one product/);
  }
});
