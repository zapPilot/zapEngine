import { expect, it } from 'vitest';
import { OPERATIONS_SOURCES, isOperationsSource } from '../shared/types.js';
import { sourceLabel } from './operator-model.js';
import { sourceColorVar } from './components/ui/tone.js';
it.each(OPERATIONS_SOURCES)('has explicit label and color for %s', (source) => {
  expect(isOperationsSource(source)).toBe(true);
  expect(sourceLabel(source)).not.toBe(source);
  expect(sourceColorVar(source)).not.toContain('undefined');
});
it('rejects unknown sources and shares GitHub color', () => {
  expect(isOperationsSource('other')).toBe(false);
  expect(isOperationsSource(null)).toBe(false);
  expect(sourceLabel('github-security')).toBe('GitHub Security');
  expect(sourceColorVar('github-security')).toBe(
    sourceColorVar('github-actions'),
  );
});
