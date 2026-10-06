import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  PDF_SITE_ORIGIN,
  pdfHrefUpdates,
  pdfHrefUpdatesForPage,
} from './export-pitch-pdf.mjs';

test('keeps same-origin targets, rebuilt from a constant origin', () => {
  assert.deepEqual(
    pdfHrefUpdates([
      'https://www.kokode.xyz/?utm_medium=pdf#contact',
      'https://www.kokode.xyz/en/pitch/?utm_medium=pdf',
    ]),
    [
      [0, 'https://www.kokode.xyz/?utm_medium=pdf#contact'],
      [1, 'https://www.kokode.xyz/en/pitch/?utm_medium=pdf'],
    ],
  );
  assert.equal(PDF_SITE_ORIGIN, 'https://www.kokode.xyz');
});

test('drops javascript:, data:, foreign-origin and unparsable targets', () => {
  assert.deepEqual(
    pdfHrefUpdates([
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'https://evil.example/?x=https://www.kokode.xyz/',
      'https://www.kokode.xyz.evil.example/',
      'https://www.kokode.xyz@evil.example/',
      '/relative/path',
      '',
      null,
      'not a url',
      'https://www.kokode.xyz/ok',
    ]),
    [[10, 'https://www.kokode.xyz/ok']],
  );
});

test('reads targets in the page and returns only validated pairs', async () => {
  const fakePage = {
    seenSelector: null,
    async $$eval(selector, fn) {
      this.seenSelector = selector;
      return fn([
        { getAttribute: () => 'https://www.kokode.xyz/?utm_medium=pdf' },
        { getAttribute: () => 'javascript:alert(1)' },
        { getAttribute: () => null },
      ]);
    },
  };
  const updates = await pdfHrefUpdatesForPage(fakePage);
  assert.equal(fakePage.seenSelector, 'a[data-pdf-href]');
  assert.deepEqual(updates, [[0, 'https://www.kokode.xyz/?utm_medium=pdf']]);
});
