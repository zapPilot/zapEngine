import { expect, it } from 'vitest';
import {
  worldLength,
  wireBorder,
  lineBorder,
  labelStem,
  cameraProgress,
} from './geometry.js';
it('preserves default and explicit world geometry styles', () => {
  expect(worldLength(12.5)).toBe('calc(12.5000 * var(--zp-u))');
  expect(wireBorder()).toBe('1.5px dashed var(--ink-3)');
  expect(wireBorder('', '')).toBe('1.5px dashed var(--ink-3)');
  expect(wireBorder('2px', 'var(--rule)')).toBe('2px dashed var(--rule)');
  expect(lineBorder('var(--ink)')).toBe('1px solid var(--ink)');
  expect(lineBorder('var(--ink)', '')).toBe('1px solid var(--ink)');
  expect(lineBorder('var(--rule)', 'dashed')).toBe('1px dashed var(--rule)');
  expect(labelStem()).toBe('calc(1.2000 * var(--zp-u))');
  expect(labelStem(0)).toBe(labelStem());
  expect(labelStem(3)).toBe('calc(3.0000 * var(--zp-u))');
});
it('eases and clamps camera segments, including degenerate intervals', () => {
  expect(cameraProgress(-1, 0, 1)).toBe(0);
  expect(cameraProgress(0.5, 0, 1)).toBe(0.5);
  expect(cameraProgress(2, 0, 1)).toBe(1);
  expect(cameraProgress(0, 1, 1)).toBe(1);
  expect(cameraProgress(0, 2, 1)).toBe(1);
});
