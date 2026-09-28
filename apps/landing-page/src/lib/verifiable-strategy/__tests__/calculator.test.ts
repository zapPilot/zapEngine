import { decodeFunctionData, type Hex } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  decimalToWad,
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
