import { describe, expect, it } from 'vitest';
import { formatDownloadSize } from '@/components/podcast/episodeFormatters';

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

describe('formatDownloadSize', () => {
  it.each([
    [0, '0 KB'],
    [-5, '0 KB'],
    [200, '0.2 KB'],
    [1.5 * KB, '1.5 KB'],
    [250 * KB, '250 KB'],
    [4 * MB, '4 MB'],
    [7.4 * MB, '7.4 MB'],
    [9.96 * MB, '10 MB'],
    [69 * MB, '69 MB'],
    [118.4 * MB, '118 MB'],
    [1.5 * GB, '1.5 GB'],
    [12 * GB, '12 GB'],
  ])('formats %s bytes as %s', (bytes, label) =>
    expect(formatDownloadSize(bytes)).toBe(label),
  );

  it('steps up a unit instead of printing 1024', () => {
    expect(formatDownloadSize(1023.9 * KB)).toBe('1 MB');
    expect(formatDownloadSize(1023.9 * MB)).toBe('1 GB');
  });
  it('stays in gigabytes however large the total grows', () => {
    expect(formatDownloadSize(5000 * GB)).toBe('5000 GB');
  });
});
