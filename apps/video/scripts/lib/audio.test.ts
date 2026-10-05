import { describe, expect, it } from 'vitest';

import { loudnormFilter, parseLoudnorm, speechBounds } from './audio';

const report = `[Parsed_loudnorm_0 @ 0x1]
{
	"input_i" : "-18.20",
	"input_tp" : "-3.10",
	"input_lra" : "4.50",
	"input_thresh" : "-28.40",
	"output_i" : "-16.00",
	"output_tp" : "-1.50",
	"output_lra" : "4.00",
	"output_thresh" : "-26.20",
	"normalization_type" : "linear",
	"target_offset" : "0.10"
}`;

describe('parseLoudnorm', () => {
  it('reads the measured input values', () => {
    expect(parseLoudnorm(`noise {"x": 1} more\n${report}`)).toEqual({
      i: -18.2,
      tp: -3.1,
      lra: 4.5,
      thresh: -28.4,
      offset: 0.1,
    });
  });

  it('rejects output without a report', () => {
    expect(() => parseLoudnorm('no json here')).toThrow(
      'No loudnorm report in output',
    );
    expect(() => parseLoudnorm('} {')).toThrow('No loudnorm report in output');
  });

  it('rejects silence, which has no integrated loudness', () => {
    expect(() => parseLoudnorm(report.replace('"-18.20"', '"-inf"'))).toThrow(
      'Unmeasurable loudness',
    );
  });
});

describe('loudnormFilter', () => {
  it('measures without a first pass and normalises linearly with one', () => {
    expect(loudnormFilter()).toBe(
      'loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json',
    );
    expect(loudnormFilter(parseLoudnorm(report))).toBe(
      'loudnorm=I=-16:TP=-1.5:LRA=11:measured_I=-18.2:measured_TP=-3.1:measured_LRA=4.5:measured_thresh=-28.4:offset=0.1:linear=true:print_format=json',
    );
  });
});

describe('speechBounds', () => {
  it('trims leading and trailing silence, keeping a little room tone', () => {
    const log = [
      'silence_start: 0',
      'silence_end: 0.40 | silence_duration: 0.40',
      'silence_start: 1.20',
      'silence_end: 1.50 | silence_duration: 0.30',
      'silence_start: 3.10',
    ].join('\n');
    const bounds = speechBounds(log, 3.5, 0.05);
    expect(bounds.start).toBeCloseTo(0.35);
    expect(bounds.end).toBeCloseTo(3.15);
  });

  it('accepts a trailing silence that ffmpeg closed at the end of the file', () => {
    const log = 'silence_start: 2.5\nsilence_end: 3.0 | silence_duration: 0.5';
    expect(speechBounds(log, 3, 0)).toEqual({ start: 0, end: 2.5 });
  });

  it('keeps clips with only inner pauses whole', () => {
    expect(speechBounds('silence_start: 1\nsilence_end: 1.3', 3)).toEqual({
      start: 0,
      end: 3,
    });
    expect(speechBounds('', 2)).toEqual({ start: 0, end: 2 });
  });

  it('ignores a stray end and falls back to the whole clip for all-silent input', () => {
    expect(speechBounds('silence_end: 0.2\nsilence_start: 0', 1)).toEqual({
      start: 0,
      end: 1,
    });
  });
});

it('supports dynamic music normalization independently of narration targets', () => {
  expect(loudnormFilter(undefined, { i: -18, tp: -2, lra: 3 })).toBe(
    'loudnorm=I=-18:TP=-2:LRA=3:print_format=json',
  );
});
