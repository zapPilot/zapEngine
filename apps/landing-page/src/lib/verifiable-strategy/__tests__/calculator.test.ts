import { scenarioInput } from '../scenarios';
import { verdict } from '../verdict';
import { decodeFunctionData, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  decimalToWad,
  dateFromDay,
  dayFromDate,
  validateInput,
  distancePercent,
  encodeInputs,
  epochDay,
  inputFromExample,
  percentToWad,
  wadToPercent,
  WAD,
} from '../encoding';
import { runCalculator, verifyDeployment, calculatorClient } from '../onchain';
import { reproductionCommands } from '../cli';
import { dataset, example, mockClient } from './fixtures';

describe('exact decimal encoding', () => {
  it('preserves epsilon and adjacent decimal units without Number', () => {
    expect(decimalToWad('0.000000000001')).toBe(1000000n);
    expect(decimalToWad('100.000000000000000001')).toBe(100n * WAD + 1n);
    expect(percentToWad('13.57')).toBe(135700000000000000n);
    expect(wadToPercent(1n)).toBe('0.0000000000000001');
  });
  it.each([
    '-1',
    'NaN',
    'Infinity',
    '1e-12',
    '',
    '.1',
    '1.0000000000000000001',
    '9'.repeat(90),
  ])('rejects %s', (value) => expect(() => decimalToWad(value)).toThrow());
  it('validates dates and allocation bounds', () => {
    expect(epochDay('2025-10-18') - epochDay('2025-10-17')).toBe(1);
    for (const date of ['2025-02-30', '1970-01-01', 'tomorrow'])
      expect(() => epochDay(date)).toThrow();
    expect(() => percentToWad('101')).toThrow();
    const input = inputFromExample(example);
    expect(encodeInputs(input).allocation[0]).toBe(WAD / 4n);
    expect(() =>
      encodeInputs({
        ...input,
        allocation: ['25.00000000000001', '25', '25', '25', '0'],
      }),
    ).not.toThrow();
    expect(() =>
      encodeInputs({ ...input, previousDate: input.date }),
    ).toThrow();
    expect(() =>
      encodeInputs({ ...input, allocation: ['1', '0', '0', '0', '0'] }),
    ).toThrow();
    expect(() => encodeInputs({ ...input, allocation: [] })).toThrow();
    expect(() => encodeInputs({ ...input, current: [] })).toThrow();
    expect(() => encodeInputs({ ...input, lastExecutedDay: -1 })).toThrow();
    expect(() =>
      encodeInputs({
        ...input,
        current: input.current.map((row) => ({
          ...row,
          price: '9'.repeat(60),
        })),
      }),
    ).toThrow();
  });
});

describe('public read-only calculator', () => {
  it('constructs fallback transport', () =>
    expect(calculatorClient().chain.id).toBe(421614));
  it('verifies code and chains three calls at one block', async () => {
    const { client, calls } = mockClient();
    const result = await runCalculator(
      inputFromExample(example),
      dataset,
      client,
    );
    expect(result.exit.target.map(String)).toEqual(
      example.expected.pyrevmTarget,
    );
    expect(result.steps.map((step) => step.name)).toEqual([
      'warmup',
      'observe',
      'cross_down_exit',
    ]);
    const requests = calls.filter((call) => call.method === 'eth_call');
    expect(requests).toHaveLength(3);
    expect(
      requests.every((call) => (call.params as unknown[])[1] === '0x64'),
    ).toBe(true);
    const commands = reproductionCommands(result, dataset.deployment!);
    expect(commands[0]!.cast).toContain('--block 100');
    expect(JSON.parse(commands[2]!.payload).params[0].data).toBe(
      result.steps[2]!.data,
    );
    expect(commands[0]!.curl).toContain('eth_call');
  });
  it('changes calldata when edited and explicitly applies published prior state', async () => {
    const { client } = mockClient();
    const input = inputFromExample(example);
    const first = await runCalculator(input, dataset, client);
    input.current[1]!.price = '89';
    input.stateMode = 'explicit';
    input.priorStates[1] = [2, 1, 20090, 1];
    const second = await runCalculator(input, dataset, client);
    expect(second.steps[1]!.data).not.toBe(first.steps[1]!.data);
    const decoded = decodeFunctionData({
      abi: dataset.abi,
      data: second.steps[1]!.data as Hex,
    });
    expect((decoded.args![0] as { blocked: number }[])[1]!.blocked).toBe(1);
    await expect(
      runCalculator({ ...input, priorStates: [] }, dataset, client),
    ).rejects.toThrow('Invalid explicit');
  });
  it.each([
    [{ chain: '0x1' }, 'Wrong network'],
    [{ code: '0x' as Hex }, 'No contract'],
    [{ code: '0x6001' as Hex }, 'codehash'],
    [{ fail: true }, 'RPC'],
  ])('fails closed for %o', async (options, message) => {
    const { client, calls } = mockClient(options);
    await expect(
      runCalculator(inputFromExample(example), dataset, client),
    ).rejects.toThrow(message);
    expect(calls.filter((call) => call.method === 'eth_call')).toHaveLength(0);
  });
  it('rejects absent deployment and stale RPC block', async () => {
    const { client } = mockClient();
    await expect(
      verifyDeployment(client, { ...dataset, deployment: null }),
    ).rejects.toThrow('Not deployed');
    await expect(verifyDeployment(client, dataset, 0n)).rejects.toThrow(
      'predates',
    );
    await expect(
      verifyDeployment(client, { ...dataset, runtimeCodehash: '0x1234' }, 100n),
    ).rejects.toThrow('codehash');
  });
});

describe('guided inputs', () => {
  it('derives scenarios using exact WAD values without mutating the example', () => {
    const original = JSON.stringify(example);
    expect(scenarioInput(example, 'real')).toEqual(inputFromExample(example));
    expect(scenarioInput(example, 'above').current[1]!.price).toBe('101');
    expect(scenarioInput(example, 'touch').current[1]!.price).toBe('100');
    expect(scenarioInput(example, 'cooldown').lastExecutedDay).toBe(
      epochDay(example.date) - 10,
    );
    const precise = structuredClone(example);
    precise.current[1]!.dma.wad = '100000000000000000001';
    expect(
      decimalToWad(scenarioInput(precise, 'above').current[1]!.price),
    ).toBe(101000000000000000001n);
    expect(JSON.stringify(example)).toBe(original);
  });
  it('round trips optional last exit dates and trims only insignificant zeros', () => {
    expect(dayFromDate('')).toBe(0);
    expect(dateFromDay(0)).toBe('');
    expect(dateFromDay(dayFromDate(example.date))).toBe(example.date);
    const precise = structuredClone(example);
    precise.current[0]!.price = {
      decimal: '100.000000000000000001',
      wad: '100000000000000000001',
    };
    expect(inputFromExample(precise).current[0]!.price).toBe(
      '100.000000000000000001',
    );
  });
  it('returns errors by field, validates safe ranges, and formats visual distances', () => {
    const input = inputFromExample(example);
    expect(validateInput(input)).toEqual({});
    input.current[1]!.price = '1e3';
    input.previous[0]!.dma = '9'.repeat(42);
    input.allocation[0] = '24.5';
    input.lastExecutedDay = epochDay(input.date) + 1;
    const errors = validateInput(input);
    expect(errors['current.1.price']).toBeTruthy();
    expect(errors['previous.0.dma']).toMatch(/safe slice range/);
    expect(errors['allocation']).toBe('Total is 99.5%, must be 100%');
    expect(errors['lastExecutedDay']).toBeTruthy();
    input.allocation[0] = '101';
    expect(validateInput(input)['allocation.0']).toMatch(/between/);
    expect(distancePercent({ price: '101', dma: '100' })).toBe('+1.00%');
    expect(distancePercent({ price: '90', dma: '100' })).toBe('−10.00%');
    expect(distancePercent({ price: '100', dma: '100' })).toBe('+0.00%');
    expect(distancePercent({ price: '0', dma: '100' })).toBeNull();
    expect(distancePercent({ price: '100', dma: '0' })).toBeNull();
    expect(distancePercent({ price: 'invalid', dma: '100' })).toBeNull();
  });
  it('describes contract outcomes including empty holdings and cooldown', () => {
    const exit = {
      matched: true,
      cooled_off: false,
      remaining_days: 0,
      trigger_mask: 2,
      exit_mask: 6,
      liquidated_mask: 6,
      target: [],
    };
    expect(verdict(exit).title).toBe('Move BTC and ETH to stablecoins.');
    expect(verdict({ ...exit, liquidated_mask: 0 }).title).toMatch(
      /nothing to sell/,
    );
    expect(
      verdict({ ...exit, cooled_off: true, remaining_days: 20 }).title,
    ).toMatch(/20 days left/);
    expect(verdict({ ...exit, matched: false }).title).toMatch(
      /No asset crossed/,
    );
    expect(
      verdict({ ...exit, trigger_mask: 1, liquidated_mask: 1 }).title,
    ).toBe('Move SPY to stablecoins.');
  });
});
