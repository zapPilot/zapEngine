import { describe, expect, it } from 'vitest';

import { buildRednoteDescription } from './rednote-playwright.js';

describe('buildRednoteDescription', () => {
  it('puts the full Rednote copy and hashtags in the description field', () => {
    expect(
      buildRednoteDescription('支付市場正在變化\n\n六成資金移動發生在境內。', [
        '支付產業',
        '#金融科技',
        '市場結構',
      ]),
    ).toBe(
      '支付市場正在變化\n\n六成資金移動發生在境內。\n\n#支付產業 #金融科技 #市場結構',
    );
  });
});
