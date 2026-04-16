import { describe, it, expect } from 'vitest';
import { webhookPayloadSchema } from '../../../src/routes/webhooks.schemas.js';

describe('webhookPayloadSchema', () => {
  it('should reject payloads with both source and sources', () => {
    const result = webhookPayloadSchema.safeParse({
      trigger: 'manual',
      source: 'defillama',
      sources: ['debank'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Cannot specify both');
    }
  });

  it('should coalesce single source into sources array', () => {
    const result = webhookPayloadSchema.safeParse({
      trigger: 'manual',
      source: 'defillama',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toEqual(['defillama']);
    }
  });

  it('should pass through sources array directly', () => {
    const result = webhookPayloadSchema.safeParse({
      trigger: 'manual',
      sources: ['defillama', 'debank'],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toEqual(['defillama', 'debank']);
    }
  });

  it('should handle payload with neither source nor sources', () => {
    const result = webhookPayloadSchema.safeParse({
      trigger: 'scheduled',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toBeUndefined();
    }
  });
});
