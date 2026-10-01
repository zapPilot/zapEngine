import { expect, it } from 'vitest';
import {
  breakpointForWidth,
  pageGutter,
  contentWidthFor,
  columnCountFor,
} from '@/lib/layout';
it('switches only at the medium and expanded boundaries', () => {
  expect([390, 767, 768, 1023, 1024, 1440].map(breakpointForWidth)).toEqual([
    'compact',
    'compact',
    'medium',
    'medium',
    'expanded',
    'expanded',
  ]);
  expect([390, 768, 1440].map(pageGutter)).toEqual([20, 32, 40]);
});
it('keeps gutters and caps each page without overflowing a narrow viewport', () => {
  expect(contentWidthFor(390, 'dashboard')).toBe(350);
  expect(contentWidthFor(1440, 'dashboard')).toBe(1120);
  expect(contentWidthFor(1440, 'reading')).toBe(720);
  expect(contentWidthFor(1440, 'narrow')).toBe(480);
  expect(contentWidthFor(1440, 'full')).toBe(1360);
  expect(contentWidthFor(20, 'full')).toBe(0);
});
it('uses content width to avoid duplicating columns on compact layouts', () => {
  expect(columnCountFor(767)).toBe(1);
  expect(columnCountFor(768)).toBe(2);
});
