import { describe, expect, it } from 'vitest';

import { GRADIENTS } from '@/constants/designSystem';

describe('design system gradients', () => {
  it('maps primary surfaces to V2 token background utilities', () => {
    expect(GRADIENTS).toMatchObject({
      PRIMARY: 'bg-accent',
      PRIMARY_20: 'bg-accent/20',
      PRIMARY_HOVER: 'bg-accent hover:bg-accent/90',
      PRIMARY_400: 'bg-accent/80',
      PRIMARY_SUBTLE: 'bg-accent/20',
      PRIMARY_SUBTLE_HOVER: 'bg-accent/30',
      PRIMARY_FAINT: 'bg-accent/10',
      PRIMARY_FAINT_HOVER: 'bg-accent/20',
      BACKGROUND: 'bg-bg',
      SUCCESS: 'bg-success',
      DANGER: 'bg-error',
      WARNING: 'bg-accent',
      INFO: 'bg-usd',
      DARK: 'bg-surface-elevated',
      LIGHT: 'bg-spy',
    });
  });
});
