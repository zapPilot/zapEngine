import type { ETLJob } from '../../src/types/index.js';

export function createEtlJob(
  overrides: Partial<ETLJob> = {},
): ETLJob {
  return {
    jobId: 'job-123',
    sources: ['hyperliquid'],
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    status: 'pending',
    ...overrides,
  };
}
