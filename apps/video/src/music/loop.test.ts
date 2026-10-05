import { expect, it } from 'vitest';

import gentle from '../../public/music/gentle-88.json';
import { loopSchema } from './loop';

it('requires frame-aligned overlap, a bounded rate and acceptance tied to exact bytes', () => {
  expect(
    loopSchema.parse({ ...gentle, review: { status: 'pending' } }).review
      .status,
  ).toBe('pending');
  const accepted = {
    ...gentle,
    review: {
      status: 'accepted',
      acceptedAt: '2026-10-05T00:00:00Z',
      sha256: gentle.sha256,
    },
  };
  expect(loopSchema.parse(accepted).review.status).toBe('accepted');
  for (const patch of [
    { periodSamples: gentle.periodSamples + 1 },
    { crossfadeSamples: 1 },
    { crossfadeSamples: gentle.periodSamples },
    { rate: 1.003 },
    { review: { status: 'accepted' } },
    {
      review: {
        status: 'accepted',
        acceptedAt: '2026-10-05T00:00:00Z',
        sha256: 'bad',
      },
    },
    { sha256: 'bad' },
  ])
    expect(() => loopSchema.parse({ ...gentle, ...patch })).toThrow();
});
