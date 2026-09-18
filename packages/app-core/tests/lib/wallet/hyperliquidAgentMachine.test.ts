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

  it('ignores a stale approval result from another master wallet', () => {
    const approving = hyperliquidAgentReducer(
      hyperliquidAgentReducer(initialHyperliquidAgentState, {
        type: 'CHECK_STARTED',
        master: MASTER,
      }),
      { type: 'APPROVE_STARTED', master: MASTER },
    );
    expect(
      hyperliquidAgentReducer(approving, {
        type: 'APPROVE_RESOLVED',
        master: OTHER,
        agentAddress: AGENT,
      }),
    ).toBe(approving);
    expect(
      hyperliquidAgentReducer(approving, {
        type: 'APPROVE_STARTED',
        master: OTHER,
      }),
    ).toBe(approving);
  });

  it('drops the agent address on failure so nothing reads as ready', () => {
    const ready = hyperliquidAgentReducer(
      hyperliquidAgentReducer(initialHyperliquidAgentState, {
        type: 'CHECK_STARTED',
        master: MASTER,
      }),
      { type: 'APPROVE_RESOLVED', master: MASTER, agentAddress: AGENT },
    );
    const failed = hyperliquidAgentReducer(ready, {
      type: 'FAILED',
      master: MASTER,
      message: 'Unable to check Hyperliquid signing',
    });
    expect(failed.status).toBe('error');
    expect(failed.agentAddress).toBeNull();
    expect(failed.error).toBe('Unable to check Hyperliquid signing');
  });

  it('rebinds to the new wallet as soon as a check starts for it', () => {
    const ready = hyperliquidAgentReducer(
      hyperliquidAgentReducer(initialHyperliquidAgentState, {
        type: 'CHECK_STARTED',
        master: MASTER,
      }),
      { type: 'APPROVE_RESOLVED', master: MASTER, agentAddress: AGENT },
    );
    // A wallet switch must not leave the previous wallet's agent addressable.
    const switched = hyperliquidAgentReducer(ready, {
      type: 'CHECK_STARTED',
      master: OTHER,
    });
    expect(switched).toEqual({
      status: 'checking',
      masterAddress: OTHER,
      agentAddress: null,
      error: null,
    });
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

  it('preserves state when an unknown runtime event reaches the reducer', () => {
    const checking = hyperliquidAgentReducer(initialHyperliquidAgentState, {
      type: 'CHECK_STARTED',
      master: MASTER,
    });

    expect(
      hyperliquidAgentReducer(
        checking,
        // Runtime boundaries can still deliver malformed events despite the
        // compile-time union, so the reducer must fail closed.
        { type: 'UNKNOWN_EVENT' } as never,
      ),
    ).toBe(checking);
  });
});