import { describe, expect, it } from 'vitest';

import { parseHyperliquidAgentRecord } from '../../src/services/hyperliquidAgentService';

describe('parseHyperliquidAgentRecord coverage', () => {
  it('rejects valid JSON that does not match the stored agent schema', () => {
    expect(parseHyperliquidAgentRecord('{}')).toBeNull();
  });
});
