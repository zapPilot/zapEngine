import { DATA_SOURCES } from '@zapengine/types/api';
import { describe, it, expect } from 'vitest';
import { webhookPayloadSchema } from '../../../src/routes/webhooks.schemas.js';

describe('webhookPayloadSchema', () => {
  it('accepts every shared DATA_SOURCES value', () => {
    for (const source of DATA_SOURCES) {
      const result = webhookPayloadSchema.safeParse({ source });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sources).toEqual([source]);
        expect(result.data.tasks).toEqual([{ source, operation: 'current' }]);
      }
    }
  });

  it('rejects invalid source values', () => {
    const result = webhookPayloadSchema.safeParse({
      source: 'btc-price',
    });

    expect(result.success).toBe(false);
  });

  it('rejects payloads with both source and sources', () => {
    const result = webhookPayloadSchema.safeParse({
      source: 'defillama',
      sources: ['debank'],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Cannot specify both');
    }
  });

  it('rejects payloads with tasks and sources', () => {
    const result = webhookPayloadSchema.safeParse({
      sources: ['debank'],
      tasks: [
        {
          source: 'token-price',
          operation: 'backfill',
          tokens: [{ tokenId: 'bitcoin', tokenSymbol: 'BTC' }],
        },
      ],
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('tasks');
    }
  });

  it('defaults empty payloads to all current sources', () => {
    const result = webhookPayloadSchema.safeParse({});

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toEqual([...DATA_SOURCES]);
      expect(result.data.tasks).toHaveLength(DATA_SOURCES.length);
    }
  });

  it('passes explicit backfill tasks through', () => {
    const result = webhookPayloadSchema.safeParse({
      tasks: [
        {
          source: 'macro-fear-greed',
          operation: 'backfill',
          startDate: '2021-01-01',
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sources).toEqual(['macro-fear-greed']);
      expect(result.data.tasks).toEqual([
        {
          source: 'macro-fear-greed',
          operation: 'backfill',
          startDate: '2021-01-01',
        },
      ]);
    }
  });
});
