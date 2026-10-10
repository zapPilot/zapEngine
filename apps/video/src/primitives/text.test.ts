import { expect, it } from 'vitest';

import { fitFontSize, pieces } from './text';

it('splits Latin on spaces and CJK by character', () => {
  expect(pieces('AI, here.')).toEqual(['AI, ', 'here.']);
  expect(pieces('Draft.')).toEqual(['Draft.']);
  expect(pieces('\u9662\u5185\u3067\u3002')).toHaveLength(4);
  expect(pieces('AI\uff0c\u5c31\u5728\u9019\u88e1\u3002').join('')).toBe(
    'AI\uff0c\u5c31\u5728\u9019\u88e1\u3002',
  );
});

it('fits the widest line to the width, never above the maximum', () => {
  expect(fitFontSize(['Draft.'], 1600, 180)).toBe(180);
  const english = fitFontSize(['The work you want AI to do'], 1500, 180);
  expect(english).toBeLessThan(110);
  expect(english).toBeGreaterThan(90);
  const japanese = fitFontSize(
    ['\u60a3\u8005\u60c5\u5831\u304c\u5165\u3063\u3066\u3044\u308b\u3002'],
    1500,
    180,
  );
  expect(japanese).toBe(136);
  expect(fitFontSize([''], 100, 50)).toBe(50);
});
