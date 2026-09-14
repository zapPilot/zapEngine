import type { Address } from 'viem';

export type HyperliquidAgentSessionStatus =
  | 'idle'
  | 'checking'
  | 'ready'
  | 'unapproved'
  | 'approving'
  | 'error';

export interface HyperliquidAgentMachineState {
  status: HyperliquidAgentSessionStatus;
  masterAddress: Address | null;
  agentAddress: Address | null;
  error: string | null;
}

export type HyperliquidAgentMachineEvent =
  | { type: 'RESET' }
  | { type: 'CHECK_STARTED'; master: Address }
  | {
      type: 'CHECK_RESOLVED';
      master: Address;
      agentAddress: Address | null;
    }
  | { type: 'APPROVE_STARTED'; master: Address }
  | {
      type: 'APPROVE_RESOLVED';
      master: Address;
      agentAddress: Address;
    }
  | { type: 'FAILED'; master: Address; message: string };

export const initialHyperliquidAgentState: HyperliquidAgentMachineState = {
  status: 'idle',
  masterAddress: null,
  agentAddress: null,
  error: null,
};

function isCurrent(
  state: HyperliquidAgentMachineState,
  master: Address,
): boolean {
  return state.masterAddress?.toLowerCase() === master.toLowerCase();
}

export function hyperliquidAgentReducer(
  state: HyperliquidAgentMachineState,
  event: HyperliquidAgentMachineEvent,
): HyperliquidAgentMachineState {
  switch (event.type) {
    case 'RESET':
      return initialHyperliquidAgentState;
    case 'CHECK_STARTED':
      return {
        status: 'checking',
        masterAddress: event.master,
        agentAddress: null,
        error: null,
      };
    case 'CHECK_RESOLVED':
      if (!isCurrent(state, event.master)) return state;
      return {
        status: event.agentAddress ? 'ready' : 'unapproved',
        masterAddress: event.master,
        agentAddress: event.agentAddress,
        error: null,
      };
    case 'APPROVE_STARTED':
      if (!isCurrent(state, event.master)) return state;
      return { ...state, status: 'approving', error: null };
    case 'APPROVE_RESOLVED':
      if (!isCurrent(state, event.master)) return state;
      return {
        status: 'ready',
        masterAddress: event.master,
        agentAddress: event.agentAddress,
        error: null,
      };
    case 'FAILED':
      if (!isCurrent(state, event.master)) return state;
      return {
        ...state,
        status: 'error',
        agentAddress: null,
        error: event.message,
      };
    default:
      return state;
  }
}
