// @vitest-environment jsdom

import type {
  PrivySimulationApproval,
  PrivySimulationAssetChange,
  PrivySimulationContract,
  PrivySimulationToken,
} from '@zapengine/types/api';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SimulationFlowRows } from '@/components/invest/simulation/SimulationFlowRows';

vi.mock('lucide-react-native', () => ({
  ArrowDownLeft: () => null,
  ArrowUpRight: () => null,
  ShieldCheck: () => null,
}));

vi.mock('react-native', () => ({
  View: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  Text: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  Image: ({ source }: { source?: { uri?: string } }) => (
    <img src={source?.uri} alt="" />
  ),
}));

const WALLET = '0x1111111111111111111111111111111111111111';
const SPENDER = '0x2222222222222222222222222222222222222222';
const RECIPIENT = '0x3333333333333333333333333333333333333333';
const SENDER = '0x4444444444444444444444444444444444444444';

const TOKEN: PrivySimulationToken = {
  address: '0x5555555555555555555555555555555555555555',
  symbol: 'TKN',
  name: 'Token',
  decimals: 18,
  logoUrl: null,
};

function createApproval(
  overrides: Partial<PrivySimulationApproval> = {},
): PrivySimulationApproval {
  return {
    callIndex: 0,
    owner: WALLET,
    spender: SPENDER,
    token: TOKEN,
    rawAmount: '1000000000000000000',
    amount: '1',
    unlimited: false,
    simulatedSpendRaw: '500000000000000000',
    exceedsSimulatedSpend: false,
    ...overrides,
  };
}

function createAssetChange(
  overrides: Partial<PrivySimulationAssetChange> = {},
): PrivySimulationAssetChange {
  return {
    callIndex: 0,
    direction: 'out',
    type: 'Transfer',
    from: WALLET,
    to: RECIPIENT,
    token: TOKEN,
    rawAmount: '1000000000000000000',
    amount: '1',
    ...overrides,
  };
}

function createContract(
  overrides: Partial<PrivySimulationContract> = {},
): PrivySimulationContract {
  return {
    address: SPENDER,
    name: 'Router',
    callIndexes: [0],
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render({
  approvals = [],
  outgoing = [],
  incoming = [],
  contracts = [],
}: {
  approvals?: readonly PrivySimulationApproval[];
  outgoing?: readonly PrivySimulationAssetChange[];
  incoming?: readonly PrivySimulationAssetChange[];
  contracts?: readonly PrivySimulationContract[];
}) {
  await act(async () =>
    root.render(
      <SimulationFlowRows {...{ approvals, outgoing, incoming, contracts }} />,
    ),
  );
}

describe('SimulationFlowRows', () => {
  it('renders the approve section before send/receive when approvals exist', async () => {
    await render({ approvals: [createApproval()] });

    const text = container.textContent ?? '';
    expect(text).toContain('You approve');
    const approveIndex = text.indexOf('You approve');
    const sendIndex = text.indexOf('You send');
    const receiveIndex = text.indexOf('You receive');
    expect(approveIndex).toBeGreaterThanOrEqual(0);
    expect(approveIndex).toBeLessThan(sendIndex);
    expect(sendIndex).toBeLessThan(receiveIndex);
  });

  it('renders no approve section when approvals is empty', async () => {
    await render({ approvals: [] });

    expect(container.textContent ?? '').not.toContain('You approve');
  });

  it('resolves the spender to its contract name when one matches', async () => {
    await render({
      approvals: [createApproval({ spender: SPENDER })],
      contracts: [
        createContract({ address: SPENDER.toUpperCase(), name: 'Router' }),
      ],
    });

    expect(container.textContent ?? '').toContain('to Router');
  });

  it('falls back to a shortened address when no contract matches', async () => {
    await render({
      approvals: [createApproval({ spender: SPENDER })],
      contracts: [],
    });

    const shortened = `${SPENDER.slice(0, 6)}…${SPENDER.slice(-4)}`;
    expect(container.textContent ?? '').toContain(`to ${shortened}`);
  });

  it('shows an Unlimited badge when the approval is unlimited', async () => {
    await render({
      approvals: [
        createApproval({ unlimited: true, exceedsSimulatedSpend: false }),
      ],
    });

    expect(container.textContent ?? '').toContain('Unlimited');
  });

  it('shows an Exceeds spend badge when the spend is exceeded and not unlimited', async () => {
    await render({
      approvals: [
        createApproval({ unlimited: false, exceedsSimulatedSpend: true }),
      ],
    });

    expect(container.textContent ?? '').toContain('Exceeds spend');
  });

  it('shows no risk badge when neither unlimited nor exceeding spend', async () => {
    await render({
      approvals: [
        createApproval({ unlimited: false, exceedsSimulatedSpend: false }),
      ],
    });

    const text = container.textContent ?? '';
    expect(text).not.toContain('Unlimited');
    expect(text).not.toContain('Exceeds spend');
  });

  it('keeps approval rows from different call indexes distinct', async () => {
    await render({
      approvals: [
        createApproval({ callIndex: 0, spender: SPENDER }),
        createApproval({ callIndex: 1, spender: SPENDER }),
      ],
    });

    const text = container.textContent ?? '';
    expect(text).toContain('Call 1');
    expect(text).toContain('Call 2');
  });

  it('keeps asset rows from different call indexes distinct', async () => {
    await render({
      outgoing: [
        createAssetChange({ callIndex: 0 }),
        createAssetChange({ callIndex: 1 }),
      ],
    });

    const text = container.textContent ?? '';
    expect(text).toContain('Call 1');
    expect(text).toContain('Call 2');
  });

  it('labels outgoing rows with the "to" counterparty resolved to its name', async () => {
    await render({
      outgoing: [createAssetChange({ direction: 'out', to: RECIPIENT })],
      contracts: [createContract({ address: RECIPIENT, name: 'Vault' })],
    });

    expect(container.textContent ?? '').toContain('to Vault');
  });

  it('labels incoming rows with the "from" counterparty resolved to its name', async () => {
    await render({
      incoming: [createAssetChange({ direction: 'in', from: SENDER })],
      contracts: [createContract({ address: SENDER, name: 'Vault' })],
    });

    expect(container.textContent ?? '').toContain('from Vault');
  });

  it('falls back to a shortened address for an unresolved asset counterparty', async () => {
    await render({
      outgoing: [createAssetChange({ direction: 'out', to: RECIPIENT })],
      contracts: [],
    });

    const shortened = `${RECIPIENT.slice(0, 6)}…${RECIPIENT.slice(-4)}`;
    expect(container.textContent ?? '').toContain(`to ${shortened}`);
  });

  it('shows "No assets detected" when outgoing is empty', async () => {
    await render({ outgoing: [], incoming: [createAssetChange()] });

    expect(container.textContent ?? '').toContain('No assets detected');
  });

  it('shows "No assets detected" when incoming is empty', async () => {
    await render({ outgoing: [createAssetChange()], incoming: [] });

    expect(container.textContent ?? '').toContain('No assets detected');
  });
});
