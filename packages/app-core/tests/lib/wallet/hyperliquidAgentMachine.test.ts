import {
  hyperliquidAgentReducer,
  initialHyperliquidAgentState,
} from '@core/lib/wallet/hyperliquidAgentMachine';
import { describe, expect, it } from 'vitest';

const MASTER = '0x1111111111111111111111111111111111111111' as const;
const OTHER = '0x2222222222222222222222222222222222222222' as const;
const AGENT = '0x3333333333333333333333333333333333333333' as const;

describe('hyperliquidAgentReducer', () => {
  it('checks, approves and becomes ready for one master wallet', () => {
    let state = hyperliquidAgentReducer(initialHyperliquidAgentState, {
      type: 'CHECK_STARTED',
      master: MASTER,
    });
    state = hyperliquidAgentReducer(state, {
      type: 'CHECK_RESOLVED',
      master: MASTER,
      agentAddress: null,
    });
    expect(state.status).toBe('unapproved');

    state = hyperliquidAgentReducer(state, {
      type: 'APPROVE_STARTED',
      master: MASTER,
    });
    expect(state.status).toBe('approving');

    state = hyperliquidAgentReducer(state, {
      type: 'APPROVE_RESOLVED',
      master: MASTER,
      agentAddress: AGENT,
    });
    expect(state).toEqual({
      status: 'ready',
      masterAddress: MASTER,
      agentAddress: AGENT,
      error: null,
    });
  });

  it('ignores stale results from another master wallet', () => {
    const checking = hyperliquidAgentReducer(initialHyperliquidAgentState, {
      type: 'CHECK_STARTED',
      master: MASTER,
    });
    expect(
      hyperliquidAgentReducer(checking, {
        type: 'CHECK_RESOLVED',
        master: OTHER,
        agentAddress: AGENT,
      }),
    ).toBe(checking);
    expect(
      hyperliquidAgentReducer(checking, {
        type: 'FAILED',
        master: OTHER,
        message: 'stale',
      }),
    ).toBe(checking);
  });

  it('reset removes every association with the previous wallet', () => {
    const ready = {
      status: 'ready' as const,
      masterAddress: MASTER,
      agentAddress: AGENT,
      error: null,
    };
    expect(hyperliquidAgentReducer(ready, { type: 'RESET' })).toEqual(
      initialHyperliquidAgentState,
    );
  });
});
