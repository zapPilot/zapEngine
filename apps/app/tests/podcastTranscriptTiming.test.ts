import { describe, expect, it } from 'vitest';

import { estimateTranscriptTiming } from '@/components/podcast/transcriptTiming';

describe('podcast transcript timing', () => {
  it('returns no segments for empty content', () => {
    expect(estimateTranscriptTiming(null, 120)).toEqual([]);
    expect(estimateTranscriptTiming('   ', 120)).toEqual([]);
  });

  it('splits paragraphs before sentences', () => {
    const segments = estimateTranscriptTiming(
      'First paragraph.\n\nSecond paragraph.',
      100,
    );

    expect(segments).toHaveLength(2);
    expect(segments[0]?.text).toBe('First paragraph.');
    expect(segments[1]?.text).toBe('Second paragraph.');
    expect(segments[0]?.start).toBe(0);
    expect(segments[1]?.end).toBe(100);
  });

  it('splits sentence-style text when no paragraphs exist', () => {
    const segments = estimateTranscriptTiming('One. Two! Three?', 90);

    expect(segments.map((segment) => segment.text)).toEqual([
      'One.',
      'Two!',
      'Three?',
    ]);
    expect(segments[0]?.start).toBe(0);
    expect(segments[2]?.end).toBe(90);
  });

  it('returns zero-time segments when duration is unavailable', () => {
    const segments = estimateTranscriptTiming('One. Two.', 0);

    expect(segments).toEqual([
      { text: 'One.', start: 0, end: 0 },
      { text: 'Two.', start: 0, end: 0 },
    ]);
  });
});
