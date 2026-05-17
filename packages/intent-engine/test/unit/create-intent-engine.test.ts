import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PreparedTransaction } from '@zapengine/types/api';
import {
  createIntentEngine,
  LiFiAdapter,
  NoopSimulationAdapter,
} from '../../src/index.js';

vi.mock('@lifi/sdk', () => ({
  createConfig: vi.fn(),
  getQuote: vi.fn(),
  getContractCallsQuote: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('../../src/builders/swap.builder.js', () => ({
  buildSwapTx: vi.fn().mockResolvedValue({ to: '0xswap' }),
}));

vi.mock('../../src/builders/supply.builder.js', () => ({
  buildSupplyTx: vi.fn().mockResolvedValue({ to: '0xsupply' }),
}));

vi.mock('../../src/builders/withdraw.builder.js', () => ({
  buildWithdrawTx: vi.fn().mockResolvedValue({ to: '0xwithdraw' }),
}));

vi.mock('../../src/builders/rotate.builder.js', () => ({
  buildRotateTx: vi.fn().mockResolvedValue({ to: '0xrotate' }),
}));

vi.mock('../../src/builders/gmx-v2-supply.builder.js', () => ({
  buildGmxV2SupplyTx: vi.fn().mockResolvedValue({ to: '0xgmx' }),
}));

vi.mock('../../src/execution/eip7702.executor.js', () => ({
  executeWithEIP7702: vi.fn().mockResolvedValue({ hash: '0xhash' }),
}));

vi.mock('../../src/execution/capability.detector.js', () => ({
  determineExecutionStrategy: vi.fn().mockResolvedValue('sequential'),
  detectEIP7702Support: vi.fn().mockResolvedValue(true),
}));

const LIFI_CONFIG = { integrator: 'test', apiKey: 'key' };
const MOCK_TX: PreparedTransaction = {
  to: '0x1111111111111111111111111111111111111111',
  data: '0x',
  value: '0',
  chainId: 8453,
  gasLimit: '100000',
  meta: { intentType: 'SUPPLY' },
};

describe('createIntentEngine factory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates an engine with a custom simulation adapter', () => {
    const simulation = new NoopSimulationAdapter();
    const engine = createIntentEngine({ lifi: LIFI_CONFIG, simulation });
    expect(engine.simulation).toBe(simulation);
  });

  it('creates an engine with a default NoopSimulationAdapter when not provided', () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    expect(engine.simulation).toBeInstanceOf(NoopSimulationAdapter);
  });

  it('exposes the LiFiAdapter on .lifi', () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    expect(engine.lifi).toBeInstanceOf(LiFiAdapter);
  });

  it('buildSwap delegates to buildSwapTx', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { buildSwapTx } = await import('../../src/builders/swap.builder.js');
    const intent = { type: 'SWAP', fromAddress: '0x1' } as never;
    await engine.buildSwap(intent);
    expect(vi.mocked(buildSwapTx)).toHaveBeenCalledWith(intent, engine.lifi);
  });

  it('buildSupply delegates to buildSupplyTx', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { buildSupplyTx } =
      await import('../../src/builders/supply.builder.js');
    const intent = { type: 'SUPPLY' } as never;
    const publicClient = {} as never;
    await engine.buildSupply(intent, publicClient);
    expect(vi.mocked(buildSupplyTx)).toHaveBeenCalledWith(
      intent,
      engine.lifi,
      publicClient,
    );
  });

  it('buildWithdraw delegates to buildWithdrawTx', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { buildWithdrawTx } =
      await import('../../src/builders/withdraw.builder.js');
    const intent = { type: 'WITHDRAW' } as never;
    engine.buildWithdraw(intent);
    expect(vi.mocked(buildWithdrawTx)).toHaveBeenCalledWith(intent);
  });

  it('buildRotate delegates to buildRotateTx', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { buildRotateTx } =
      await import('../../src/builders/rotate.builder.js');
    const intent = { type: 'ROTATE' } as never;
    const publicClient = {} as never;
    await engine.buildRotate(intent, publicClient);
    expect(vi.mocked(buildRotateTx)).toHaveBeenCalledWith(
      intent,
      engine.lifi,
      publicClient,
    );
  });

  it('buildGmxV2Supply delegates to buildGmxV2SupplyTx', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { buildGmxV2SupplyTx } =
      await import('../../src/builders/gmx-v2-supply.builder.js');
    const intent = { type: 'GMX_V2_SUPPLY' } as never;
    await engine.buildGmxV2Supply(intent);
    expect(vi.mocked(buildGmxV2SupplyTx)).toHaveBeenCalledWith(
      intent,
      engine.lifi,
    );
  });

  it('simulateTx delegates to the simulation adapter', async () => {
    const simulation = {
      simulate: vi.fn().mockResolvedValue({ success: true }),
    };
    const engine = createIntentEngine({ lifi: LIFI_CONFIG, simulation });
    await engine.simulateTx(MOCK_TX);
    expect(simulation.simulate).toHaveBeenCalledWith(MOCK_TX);
  });

  it('getTokenPrice delegates to lifiAdapter.getTokenPrice', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const mockTokenInfo = {
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      priceUSD: '1.0',
    } as never;
    vi.spyOn(engine.lifi, 'getTokenPrice').mockResolvedValue(mockTokenInfo);
    const result = await engine.getTokenPrice(
      8453,
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
    expect(result).toBe(mockTokenInfo);
    expect(engine.lifi.getTokenPrice).toHaveBeenCalledWith(
      8453,
      '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    );
  });

  it('getExecutionStrategy delegates to determineExecutionStrategy', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { determineExecutionStrategy } =
      await import('../../src/execution/capability.detector.js');
    await engine.getExecutionStrategy();
    expect(vi.mocked(determineExecutionStrategy)).toHaveBeenCalled();
  });

  it('executeWithEIP7702 delegates to executeWithEIP7702', async () => {
    const engine = createIntentEngine({ lifi: LIFI_CONFIG });
    const { executeWithEIP7702 } =
      await import('../../src/execution/eip7702.executor.js');
    const wallet = {} as never;
    await engine.executeWithEIP7702([MOCK_TX], wallet);
    expect(vi.mocked(executeWithEIP7702)).toHaveBeenCalledWith(
      [MOCK_TX],
      wallet,
    );
  });
});
