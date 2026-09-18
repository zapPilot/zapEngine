import { describe, expect, it } from 'vitest';

import type { EtlJobStatus } from '@zapengine/types/etl';
import { validateJobStatusResponse } from '../../../src/routes/webhooks.responses.js';

describe('webhooks.responses coverage', () => {
  it('returns the validation error for a schema-invalid job status', () => {
    const invalid = {
      jobId: 123,
      status: 'bogus',
      createdAt: 'not-a-date',
    } as unknown as EtlJobStatus;

    const { validated, validationError } = validateJobStatusResponse(invalid);

    expect(validationError).toBeDefined();
    expect(validated).toBe(invalid);
  });
});
