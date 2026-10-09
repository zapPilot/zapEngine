import { describe, expect, it } from 'vitest';

import {
  isUsableRednoteTitle,
  readRednoteTitleVariant,
  REDNOTE_TITLE_VARIANT_KEY,
} from './title-variants.js';

describe('Rednote title variants', () => {
  it('keeps the historical budget key', () => {
    expect(REDNOTE_TITLE_VARIANT_KEY).toBe('20');
  });

  it.each([
    null,
    [],
    'bad',
    {},
    { '20': null },
    { '20': { title: 1, method: 'llm' } },
    { '20': { title: '有效标题', method: 'other' } },
    { '20': { title: '有效标题', method: ['llm'] } },
    { '20': { title: '標'.repeat(21), method: 'llm' } },
    { '20': { title: ' ', method: 'llm' } },
    { '20': { title: '标题\n第二行', method: 'llm' } },
    // A mechanically cut legacy variant is never sent, whatever its length.
    { '20': { title: 'ether.fi为何告别', method: 'truncate' } },
  ])('rejects an unusable stored variant: %j', (raw) => {
    expect(readRednoteTitleVariant(raw)).toBeNull();
  });

  it('accepts a legacy llm variant written under the 20-code-point rule', () => {
    expect(
      readRednoteTitleVariant({
        '20': { title: ' 韩国经港触达全球：RWA如何跑通？ ', method: 'llm' },
        '100': { title: '其他标题', method: 'llm' },
      }),
    ).toBe('韩国经港触达全球：RWA如何跑通？');
  });

  it('accepts a variant only the platform measure lets through', () => {
    // 25 code points, 20 Rednote units (live counter 2026-10-09: `20 / 20`).
    const title = 'Quant一周暴涨300% 代币化存款赛道为何火了';
    expect([...title].length).toBe(25);
    expect(readRednoteTitleVariant({ '20': { title, method: 'llm' } })).toBe(
      title,
    );
  });

  it.each([
    ['', false],
    ['标题\r', false],
    ['Bitget遭3.5億美元駭客攻擊，資金追蹤全解析', false],
    ['ether.fi为何告别EigenLayer？', true],
  ])('measures usability of %j', (title, usable) => {
    expect(isUsableRednoteTitle(title)).toBe(usable);
  });
});
