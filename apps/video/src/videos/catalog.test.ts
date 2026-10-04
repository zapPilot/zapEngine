import { describe, expect, it } from 'vitest';

import { shots } from './calculator-pitch/shots';
import { getShots, getVideo } from './catalog';

describe('getShots', () => {
  it('returns the shot list of a captured video', () => {
    expect(getShots('calculator-pitch')).toBe(shots);
  });

  it('refuses a video that has nothing to capture', () => {
    expect(getVideo('kokode-clinic').shots).toBeUndefined();
    expect(() => getShots('kokode-clinic')).toThrow(
      'Video "kokode-clinic" has no shots to capture.',
    );
  });

  it('refuses an unknown video', () => {
    expect(() => getShots('nope')).toThrow('Unknown video "nope"');
  });
});
