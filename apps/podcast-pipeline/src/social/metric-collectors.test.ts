import { describe, expect, it } from 'vitest';

import {
  extractRednoteNoteId,
  extractXPostId,
  parseClockDurationSeconds,
  parseFirstMetricNumber,
  parseMetricNumber,
  parseRednoteEditorText,
} from './metric-collectors.js';

describe('metric collector parsing', () => {
  it.each([
    ['0', 0],
    ['1,234', 1234],
    ['1.2K', 1200],
    ['2.5M', 2_500_000],
    ['1.5万', 15_000],
    ['2億', 200_000_000],
  ])('parses %s into %d', (raw, expected) => {
    expect(parseMetricNumber(raw)).toBe(expected);
  });

  it('rejects unreadable metric text', () => {
    expect(parseMetricNumber('many')).toBeNull();
    expect(parseMetricNumber('')).toBeNull();
  });

  it('extracts a metric from an aria label or rendered text', () => {
    expect(parseFirstMetricNumber('1.2K Views')).toBe(1200);
    expect(parseFirstMetricNumber('讚 35')).toBe(35);
    expect(parseFirstMetricNumber(null)).toBeNull();
  });

  it('parses platform ids and Rednote editor metadata used by reconciliation', () => {
    expect(
      extractXPostId('https://x.com/fromfedtochain/status/2088805628345188514'),
    ).toBe('2088805628345188514');
    expect(extractXPostId('https://x.com/home')).toBeNull();
    expect(parseClockDurationSeconds('08:00')).toBe(480);
    expect(parseClockDurationSeconds('1:02:03')).toBe(3723);
    expect(parseClockDurationSeconds('1:99')).toBeNull();
    expect(
      parseRednoteEditorText(
        '第一段\n\n第二段\n\n#Manus #Meta #AI創業 #創業故事 #大模型',
      ),
    ).toEqual({
      body: '第一段\n\n第二段',
      hashtags: ['Manus', 'Meta', 'AI創業', '創業故事', '大模型'],
    });
  });

  it('extracts the Rednote note id from Creator Studio impression metadata', () => {
    expect(
      extractRednoteNoteId(
        JSON.stringify({
          noteTarget: {
            type: 'NoteTarget',
            value: { noteId: '6a811705000000000c003000' },
          },
        }),
      ),
    ).toBe('6a811705000000000c003000');
    expect(extractRednoteNoteId('{bad-json')).toBeNull();
    expect(extractRednoteNoteId(null)).toBeNull();
  });
});
