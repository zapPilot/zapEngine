import { describe, expect, it } from 'vitest';

import { findTransportTitleProblems } from './title-barrier.js';

const episode = { title: '市場更新', summary: '摘要', description: '描述' };

describe('findTransportTitleProblems', () => {
  it('reports no problem when every titled lane can send its title', () => {
    expect(
      findTransportTitleProblems(episode, [
        { platform: 'rednote' },
        { platform: 'youtube' },
      ]),
    ).toEqual([]);
  });

  it('ignores lanes that carry no transport title', () => {
    expect(
      findTransportTitleProblems({ ...episode, title: '标'.repeat(300) }, [
        { platform: 'x' },
        { platform: 'threads' },
      ]),
    ).toEqual([]);
  });

  it('reports a Rednote title over the measured budget (live counter 21 / 20)', () => {
    const problems = findTransportTitleProblems(
      { ...episode, title: 'Bitget遭3.5億美元駭客攻擊，資金追蹤全解析' },
      [{ platform: 'rednote' }],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('Rednote');
    expect(problems[0]).toContain('21 units');
  });

  it('accepts a legacy llm variant when the Best Title does not fit', () => {
    expect(
      findTransportTitleProblems(
        {
          ...episode,
          title: '标'.repeat(30),
          titleVariants: {
            '20': { title: '你用USDT买到什么？', method: 'llm' },
          },
        },
        [{ platform: 'rednote' }],
      ),
    ).toEqual([]);
  });

  it('rejects a legacy truncate variant', () => {
    expect(
      findTransportTitleProblems(
        {
          ...episode,
          title: '标'.repeat(30),
          titleVariants: { '20': { title: '截斷標題', method: 'truncate' } },
        },
        [{ platform: 'rednote' }],
      ),
    ).toHaveLength(1);
  });

  it('judges an override on its own, never falling back to the Best Title', () => {
    expect(
      findTransportTitleProblems(episode, [
        { platform: 'rednote', titleOverride: '標'.repeat(21) },
      ]),
    ).toEqual([
      'Rednote: Rednote title override measures 21 units, over budget',
    ]);
    expect(
      findTransportTitleProblems(episode, [
        { platform: 'rednote', titleOverride: '舊佇列短標題' },
      ]),
    ).toEqual([]);
  });

  it('reports a YouTube title over 100 characters', () => {
    expect(
      findTransportTitleProblems({ ...episode, title: '界'.repeat(101) }, [
        { platform: 'youtube' },
      ]),
    ).toEqual(['YouTube: YouTube title is 101 characters, over 100']);
  });

  it('reports Rednote risk terms in the title that would be sent', () => {
    const problems = findTransportTitleProblems(
      { ...episode, title: '建議低配債券' },
      [{ platform: 'rednote' }],
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('risk terms');
    expect(problems[0]).toContain('低配');
  });

  it('does not apply the Rednote lexicon to YouTube', () => {
    expect(
      findTransportTitleProblems({ ...episode, title: '建議低配債券' }, [
        { platform: 'youtube' },
      ]),
    ).toEqual([]);
  });

  it('collects the problems of every lane', () => {
    expect(
      findTransportTitleProblems({ ...episode, title: '界'.repeat(101) }, [
        { platform: 'rednote' },
        { platform: 'youtube' },
      ]),
    ).toHaveLength(2);
  });
});
