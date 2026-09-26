import { describe, expect, it } from 'vitest';

import { parseHyperliquidAgentRecord } from '../../src/services/hyperliquidAgentService';

describe('parseHyperliquidAgentRecord coverage', () => {
  it('returns null when no stored agent record exists', () => {
    expect(parseHyperliquidAgentRecord(null)).toBeNull();
  });

  it('rejects valid JSON that does not match the stored agent schema', () => {
    expect(parseHyperliquidAgentRecord('{}')).toBeNull();
  });
});
