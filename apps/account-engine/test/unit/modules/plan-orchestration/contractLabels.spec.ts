import {
  encodeDeposit,
  encodeGmxV2CreateDepositMulticall,
  encodeWithdraw,
  GMX_V2_ADDRESSES,
  GMX_V2_MARKETS,
} from '@zapengine/intent-engine';
import { describe, expect, it } from 'vitest';

import {
  decodeProtocolMethod,
  resolveProtocolContractName,
} from '../../../../src/modules/plan-orchestration/contractLabels';

const WALLET = '0x1111111111111111111111111111111111111111';

describe('resolveProtocolContractName', () => {
  it('names the GMX exchange router and the LI.FI diamond', () => {
    expect(
      resolveProtocolContractName(
        GMX_V2_ADDRESSES.exchangeRouter.toLowerCase(),
      ),
    ).toBe('GMX Exchange Router');
    expect(
      resolveProtocolContractName('0x1231deb6f5749ef6ce6943a275a1d3e7486f4eae'),
    ).toBe('LI.FI Diamond');
  });

  it('matches regardless of address casing', () => {
    expect(resolveProtocolContractName(GMX_V2_ADDRESSES.exchangeRouter)).toBe(
      'GMX Exchange Router',
    );
  });

  it('leaves unknown contracts unnamed', () => {
    expect(
      resolveProtocolContractName('0x4444444444444444444444444444444444444444'),
    ).toBeNull();
  });
});

describe('decodeProtocolMethod', () => {
  it('names the vault calls a deposit and a withdraw plan builds', () => {
    expect(decodeProtocolMethod(encodeDeposit(1_000_000n, WALLET))).toBe(
      'deposit',
    );
    expect(
      decodeProtocolMethod(encodeWithdraw(1_000_000n, WALLET, WALLET)),
    ).toBe('withdraw');
  });

  it('names the GMX exchange router multicall a strategy plan builds', () => {
    const { data } = encodeGmxV2CreateDepositMulticall({
      receiver: WALLET,
      market: GMX_V2_MARKETS['eth-usdc'],
      longTokenAmount: 0n,
      shortTokenAmount: 5_000_000n,
      minMarketTokens: 1n,
    });

    expect(decodeProtocolMethod(data)).toBe('multicall');
  });

  it('leaves calldata built from an ABI we do not own undecoded', () => {
    // LI.FI's swap/bridge selectors arrive on the quote, so its diamond calls
    // have no ABI here and must stay null rather than be mislabelled.
    expect(decodeProtocolMethod(`0x4630a0d8${'00'.repeat(32)}`)).toBeNull();
  });

  it('leaves a plain value transfer undecoded', () => {
    expect(decodeProtocolMethod('0x')).toBeNull();
  });
});
