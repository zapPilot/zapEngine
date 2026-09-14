import { describe, expect, it } from 'vitest';

import {
  SimulationApprovalSchema,
  SimulationAssetChangeSchema,
  SimulationBytes32Schema,
  SimulationCallSchema,
  SimulationContractSchema,
  SimulationDecimalAmountSchema,
  SimulationDecimalIntegerSchema,
  SimulationTokenSchema,
  SimulationWarningCodeSchema,
  SimulationWarningSchema,
} from '../../../src/api/simulation-review.js';

const ADDRESS = '0x1111111111111111111111111111111111111111';
const OTHER_ADDRESS = '0x2222222222222222222222222222222222222222';
const TOKEN = {
  address: ADDRESS,
  symbol: 'USDC',
  name: 'USD Coin',
  decimals: 6,
  logoUrl: 'https://example.com/usdc.png',
};

describe('simulation scalar contracts', () => {
  it.each(['0', '00', '1', '999999999999999999999999999999999999'])(
    'accepts decimal integer %s without coercion',
    (value) => expect(SimulationDecimalIntegerSchema.parse(value)).toBe(value),
  );
  it.each(['', '-1', '+1', '1.0', ' 1', '1e3'])(
    'rejects non-integer decimal representation %s',
    (value) =>
      expect(SimulationDecimalIntegerSchema.safeParse(value).success).toBe(
        false,
      ),
  );
  it.each(['0', '0.0', '001.2500', '999999999999999999.000001'])(
    'accepts non-negative decimal amount %s',
    (value) => expect(SimulationDecimalAmountSchema.parse(value)).toBe(value),
  );
  it.each(['', '.1', '1.', '-0.1', '+1', '1e-3'])(
    'rejects malformed decimal amount %s',
    (value) =>
      expect(SimulationDecimalAmountSchema.safeParse(value).success).toBe(
        false,
      ),
  );

  it('requires exactly 32 hexadecimal bytes', () => {
    expect(SimulationBytes32Schema.parse(`0x${'aF'.repeat(32)}`)).toHaveLength(
      66,
    );
    for (const value of [
      `0x${'a'.repeat(63)}`,
      `0x${'a'.repeat(65)}`,
      `0x${'g'.repeat(64)}`,
      `${'a'.repeat(64)}`,
    ]) {
      expect(SimulationBytes32Schema.safeParse(value).success).toBe(false);
    }
  });
});

describe('simulation token and call contracts', () => {
  it('accepts nullable fields and both decimals boundaries', () => {
    expect(
      SimulationTokenSchema.parse({
        ...TOKEN,
        address: null,
        decimals: 0,
        logoUrl: null,
      }),
    ).toMatchObject({ address: null, decimals: 0, logoUrl: null });
    expect(
      SimulationTokenSchema.parse({ ...TOKEN, decimals: 255 }).decimals,
    ).toBe(255);
  });

  it.each([-1, 256, 1.5])('rejects token decimals %s', (decimals) => {
    expect(
      SimulationTokenSchema.safeParse({ ...TOKEN, decimals }).success,
    ).toBe(false);
  });

  it('rejects empty labels, invalid URLs, and unknown fields', () => {
    expect(
      SimulationTokenSchema.safeParse({ ...TOKEN, symbol: '' }).success,
    ).toBe(false);
    expect(
      SimulationTokenSchema.safeParse({ ...TOKEN, name: '' }).success,
    ).toBe(false);
    expect(
      SimulationTokenSchema.safeParse({ ...TOKEN, logoUrl: 'not-a-url' })
        .success,
    ).toBe(false);
    expect(
      SimulationTokenSchema.safeParse({ ...TOKEN, unexpected: true }).success,
    ).toBe(false);
  });

  it('accepts empty calldata and the maximum 50,000-byte payload', () => {
    const base = {
      index: 0,
      to: ADDRESS,
      value: '0',
      method: null,
      status: 'skipped' as const,
      gasUsed: null,
      error: null,
    };
    expect(SimulationCallSchema.parse({ ...base, data: '0x' }).data).toBe('0x');
    const maximum = `0x${'aa'.repeat(50_000)}`;
    expect(SimulationCallSchema.parse({ ...base, data: maximum }).data).toBe(
      maximum,
    );
    expect(
      SimulationCallSchema.safeParse({
        ...base,
        data: `0x${'aa'.repeat(50_001)}`,
      }).success,
    ).toBe(false);
  });

  it('rejects negative indexes, odd hex data, statuses, and extra fields', () => {
    const base = {
      index: 0,
      to: ADDRESS,
      data: '0x00',
      value: '0',
      method: 'transfer',
      status: 'succeeded',
      gasUsed: '21000',
      error: null,
    };
    expect(SimulationCallSchema.safeParse({ ...base, index: -1 }).success).toBe(
      false,
    );
    expect(
      SimulationCallSchema.safeParse({ ...base, data: '0x0' }).success,
    ).toBe(false);
    expect(
      SimulationCallSchema.safeParse({ ...base, status: 'pending' }).success,
    ).toBe(false);
    expect(
      SimulationCallSchema.safeParse({ ...base, unexpected: true }).success,
    ).toBe(false);
  });
});

describe('simulation evidence records', () => {
  it('parses an inbound native asset change', () => {
    const value = {
      callIndex: 0,
      direction: 'in',
      type: 'native',
      from: null,
      to: ADDRESS,
      token: { ...TOKEN, address: null },
      rawAmount: '1',
      amount: '0.000000000000000001',
    };
    expect(SimulationAssetChangeSchema.parse(value)).toEqual(value);
  });

  it('rejects invalid asset directions and empty types', () => {
    const base = {
      callIndex: 0,
      direction: 'out',
      type: 'erc20',
      from: ADDRESS,
      to: OTHER_ADDRESS,
      token: TOKEN,
      rawAmount: '1',
      amount: '1',
    };
    expect(
      SimulationAssetChangeSchema.safeParse({ ...base, direction: 'sideways' })
        .success,
    ).toBe(false);
    expect(
      SimulationAssetChangeSchema.safeParse({ ...base, type: '' }).success,
    ).toBe(false);
  });

  it('parses exact and unlimited approvals', () => {
    const base = {
      callIndex: 0,
      owner: ADDRESS,
      spender: OTHER_ADDRESS,
      token: TOKEN,
      rawAmount: '10',
      amount: '10',
      unlimited: false,
      simulatedSpendRaw: '10',
      exceedsSimulatedSpend: false,
    };
    expect(SimulationApprovalSchema.parse(base)).toEqual(base);
    expect(
      SimulationApprovalSchema.parse({
        ...base,
        unlimited: true,
        exceedsSimulatedSpend: true,
      }),
    ).toMatchObject({ unlimited: true, exceedsSimulatedSpend: true });
  });

  it('allows empty contract calls but rejects negative indexes', () => {
    expect(
      SimulationContractSchema.parse({
        address: ADDRESS,
        name: null,
        callIndexes: [],
      }).callIndexes,
    ).toEqual([]);
    expect(
      SimulationContractSchema.safeParse({
        address: ADDRESS,
        name: 'Contract',
        callIndexes: [-1],
      }).success,
    ).toBe(false);
  });

  it('accepts every warning code and optional evidence fields', () => {
    for (const code of [
      'UNDECODED_METHOD',
      'UNLIMITED_APPROVAL',
      'APPROVAL_EXCEEDS_SIMULATED_SPEND',
    ] as const) {
      expect(SimulationWarningCodeSchema.parse(code)).toBe(code);
    }
    expect(
      SimulationWarningSchema.parse({
        code: 'UNLIMITED_APPROVAL',
        message: 'Review allowance',
        callIndex: 0,
        address: ADDRESS,
      }),
    ).toMatchObject({ callIndex: 0, address: ADDRESS });
    expect(
      SimulationWarningSchema.parse({
        code: 'UNDECODED_METHOD',
        message: 'Unknown selector',
      }),
    ).not.toHaveProperty('callIndex');
  });

  it('rejects warning code, empty message, and extra fields', () => {
    expect(
      SimulationWarningSchema.safeParse({ code: 'OTHER', message: 'x' })
        .success,
    ).toBe(false);
    expect(
      SimulationWarningSchema.safeParse({
        code: 'UNDECODED_METHOD',
        message: '',
      }).success,
    ).toBe(false);
    expect(
      SimulationWarningSchema.safeParse({
        code: 'UNDECODED_METHOD',
        message: 'x',
        extra: true,
      }).success,
    ).toBe(false);
  });
});
