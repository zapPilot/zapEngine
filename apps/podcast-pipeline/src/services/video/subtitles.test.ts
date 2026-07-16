import { describe, expect, it } from 'vitest';

import { createAssSubtitles, wrapSubtitle } from './subtitles.js';

describe('wrapSubtitle', () => {
  it('keeps short text and exact-width Traditional Chinese on one line', () => {
    expect(wrapSubtitle('網路即將進入緊急狀態')).toEqual([
      '網路即將進入緊急狀態',
    ]);
    const exactWidth = '甲'.repeat(26);
    expect(wrapSubtitle(exactWidth)).toEqual([exactWidth]);
  });

  it('wraps mixed-width text into no more than two safe-area lines', () => {
    const lines = wrapSubtitle(
      '這是一段 Traditional Chinese subtitle 字幕測試文字',
    );

    expect(lines).toHaveLength(2);
    expect(lines.join('')).toBe(
      '這是一段 Traditional Chinese subtitle 字幕測試文字',
    );
  });

  it('moves a preceding glyph with punctuation that would start line two', () => {
    const text = `${'甲'.repeat(26)}，${'乙'.repeat(10)}`;
    const lines = wrapSubtitle(text);

    expect(lines).toEqual(['甲'.repeat(25), `甲，${'乙'.repeat(10)}`]);
    expect(lines[1]).not.toMatch(/^[，。、：；！？）」』]/);
  });

  it('preserves a valid explicit two-line editorial break', () => {
    expect(wrapSubtitle('第一行\n第二行')).toEqual(['第一行', '第二行']);
  });

  it('rejects explicit or automatic text that cannot fit two lines', () => {
    expect(() => wrapSubtitle('一\n二\n三')).toThrow(
      'more than two explicit lines',
    );
    expect(() => wrapSubtitle(`${'甲'.repeat(27)}\n乙`)).toThrow(
      'line is too long',
    );
    expect(() => wrapSubtitle('甲'.repeat(53))).toThrow(
      'cannot fit within two lines',
    );
    expect(() =>
      wrapSubtitle(`${'甲'.repeat(26)}，${'乙'.repeat(25)}`),
    ).toThrow('cannot fit within two lines');
  });
});

describe('createAssSubtitles', () => {
  it('emits 1080p Traditional Chinese styling, rounded times, and escaped text', () => {
    const ass = createAssSubtitles([
      {
        startMs: 3_661_234,
        endMs: 3_662_345,
        text: '電網{緊急}\n啟動',
      },
    ]);

    expect(ass).toContain('PlayResX: 1920');
    expect(ass).toContain('PlayResY: 1080');
    expect(ass).toContain('YCbCr Matrix: TV.709');
    expect(ass).toContain('Style: Subtitle,Noto Sans CJK TC,60,');
    expect(ass).toContain(
      'Dialogue: 0,1:01:01.23,1:01:02.35,Subtitle,,0,0,0,,電網\\{緊急\\}\\N啟動',
    );
  });

  it('emits a valid events section without dialogue for an empty cue list', () => {
    const ass = createAssSubtitles([]);

    expect(ass).toContain('[Events]');
    expect(ass).not.toContain('Dialogue:');
    expect(ass.endsWith('\n')).toBe(true);
  });
});
