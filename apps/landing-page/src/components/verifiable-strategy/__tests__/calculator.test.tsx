import {
  act,
  fireEvent,
  render,
  screen,
  cleanup,
} from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StrategyCalculator } from '../StrategyCalculator';
import CalculatorPage from '@/app/track-record/calculator/page';
import {
  dataset,
  example,
  mockClient,
} from '@/lib/verifiable-strategy/__tests__/fixtures';
import { inputFromExample } from '@/lib/verifiable-strategy/encoding';
import { runCalculator } from '@/lib/verifiable-strategy/onchain';
import { ContractAnswer } from '../ContractAnswer';
import { CalculatorForm } from '../CalculatorForm';
import { AssetCrossTrack } from '../AssetCrossTrack';
import { AllocationCompare } from '../AllocationPreview';
import { VerifyYourself } from '../VerifyYourself';
import { WAD } from '@/lib/verifiable-strategy/encoding';
import { deployStrategy } from '@/lib/verifiable-strategy/deployment';

const state = vi.hoisted(() => ({
  query: new URLSearchParams(),
  fail: false,
  verifyFail: '' as '' | 'error' | 'string',
  runFail: '' as '' | 'codehash' | 'network' | 'string',
}));
vi.mock('next/navigation', () => ({ useSearchParams: () => state.query }));
vi.mock('@/lib/verifiable-strategy/deployment', async (importOriginal) => ({
  ...(await importOriginal<
    typeof import('@/lib/verifiable-strategy/deployment')
  >()),
  deployStrategy: vi.fn(),
}));
vi.mock('@/lib/verifiable-strategy/onchain', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/verifiable-strategy/onchain')>();
  return {
    ...actual,
    calculatorClient: () => mockClient().client,
    verifyDeployment: async (
      client: Parameters<typeof actual.verifyDeployment>[0],
      data: Parameters<typeof actual.verifyDeployment>[1],
      block?: Parameters<typeof actual.verifyDeployment>[2],
    ) => {
      if (state.verifyFail === 'error')
        throw new Error('Bytecode check failed');
      if (state.verifyFail === 'string') throw 'string failure';
      return actual.verifyDeployment(client, data, block);
    },
    runCalculator: (
      input: Parameters<typeof actual.runCalculator>[0],
      data: Parameters<typeof actual.runCalculator>[1],
    ) => {
      if (state.runFail === 'codehash')
        return Promise.reject(new Error('Runtime codehash mismatch'));
      if (state.runFail === 'network')
        return Promise.reject(new Error('Network unreachable'));
      if (state.runFail === 'string') return Promise.reject('string failure');
      return actual.runCalculator(
        input,
        data,
        mockClient({ fail: state.fail }).client,
      );
    },
  };
});
beforeEach(() => {
  state.query = new URLSearchParams();
  state.fail = false;
  state.verifyFail = '';
  state.runFail = '';
});
afterEach(cleanup);

it('always identifies the research slice and shows honest undeployed state', () => {
  render(<CalculatorPage />);
  expect(
    screen.getByText(
      /Research slice: 1 of 6 rules, not the production strategy/,
    ),
  ).toBeInTheDocument();
  cleanup();
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  expect(screen.getByText(/Contract not deployed yet/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Call contract/ })).toBeDisabled();
  expect(screen.getByLabelText('BTC price on decision day')).not.toHaveValue(
    '',
  );
});
it('runs the default example, shows match, and labels stale outputs after edits', async () => {
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText(/Codehash matches/);
  fireEvent.click(screen.getByRole('button', { name: /^Call contract/ }));
  await screen.findByText('✓ Same result as the Python backtest');
  expect(
    screen.getByText('✓ Answer returned by the contract'),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Bytecode checked · 3 read-only calls at the same block/),
  ).toBeInTheDocument();
  const proof = screen
    .getByText(/Verify it yourself · inputs & proof/)
    .closest('details');
  expect(proof).not.toHaveAttribute('open');
  fireEvent.click(screen.getByText(/Verify it yourself · inputs & proof/));
  expect(
    screen.getByLabelText('On-chain calculation receipt'),
  ).toHaveTextContent('warmup → observe → cross_down_exit');
  const before = screen.getAllByText(/cast call/)[1]!.textContent;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Copy warmup cast command' }),
  );
  await screen.findByText('Copied');
  fireEvent.change(screen.getByLabelText('BTC price on decision day'), {
    target: { value: '89' },
  });
  expect(
    screen.getByText('Previous answer — inputs changed'),
  ).toBeInTheDocument();
  expect(
    screen.queryByText('✓ Same result as the Python backtest'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /^Call contract/ }));
  await screen.findByText(
    'Custom inputs, so there is no historical comparison.',
  );
  expect(screen.getAllByText(/cast call/)[1]!.textContent).not.toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Restore real inputs' }));
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '90.00',
  );
});
it('selects the date query and displays errors without a historical match', async () => {
  state.query = new URLSearchParams('date=2025-10-19');
  render(<StrategyCalculator data={dataset} />);
  expect(
    screen.getByText(
      /No verified historical example is available for 2025-10-19/,
    ),
  ).toBeInTheDocument();
  cleanup();
  state.query = new URLSearchParams('date=2025-10-18');
  state.fail = true;
  render(<StrategyCalculator data={dataset} />);
  fireEvent.click(screen.getByRole('button', { name: /^Call contract/ }));
  await screen.findByRole('alert');
  expect(screen.queryByText(/Matches the published/)).not.toBeInTheDocument();
});
it('exposes explicit state and allows editing allocations and touch mode', () => {
  const onChange = vi.fn();
  const input = {
    ...inputFromExample(example),
    stateMode: 'explicit' as const,
  };
  render(
    <CalculatorForm
      input={input}
      onChange={onChange}
      running={false}
      onRun={vi.fn()}
    />,
  );
  expect(
    screen.getByText('This example requires explicit historical state.'),
  ).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('BTC allocation percent'), {
    target: { value: '24' },
  });
  expect(onChange.mock.calls[0]![0].allocation[0]).toBe('24');
  fireEvent.click(screen.getByRole('switch'));
  expect(onChange.mock.calls[1]![0].crossOnTouch).toBe(false);
});
it('does not claim a match for cooldown or unmatched candidates', async () => {
  const result = await runCalculator(inputFromExample(example), dataset);
  result.exit.cooled_off = true;
  result.exit.remaining_days = 3;
  render(
    <ContractAnswer
      result={result}
      submitted={inputFromExample(example)}
      example={example}
      data={dataset}
      stale={false}
      historical={true}
      running={false}
      disabled={false}
      error=""
    />,
  );
  expect(screen.getByText(/The exit rule is cooling down/)).toBeInTheDocument();
  expect(
    screen.getByText('Does not match the published decision.'),
  ).toBeInTheDocument();
});

it('edits all scenarios before deployment, validates fields, and never calls', () => {
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  fireEvent.click(
    screen.getByRole('button', { name: 'BTC holds above its average' }),
  );
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '101.00',
  );
  expect(screen.getByRole('img', { name: /BTC: yesterday/ })).toHaveAttribute(
    'aria-label',
    expect.stringContaining('today +1.00%'),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Exit rule cooling down' }),
  );
  expect(screen.getByLabelText('Last exit executed')).toHaveValue('2025-10-08');
  fireEvent.click(
    screen.getByRole('button', { name: 'BTC closes on its average' }),
  );
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '100.00',
  );
  fireEvent.change(screen.getByLabelText('BTC price on decision day'), {
    target: { value: '1.0000000000000000001' },
  });
  expect(screen.getByLabelText('BTC price on decision day')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(
    screen.getByLabelText('BTC price on decision day'),
  ).toHaveAccessibleDescription(/18 places/);
  fireEvent.change(screen.getByLabelText('BTC allocation percent'), {
    target: { value: '24.5' },
  });
  expect(screen.getByText('Total is 99.5%, must be 100%')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Restore real inputs' }));
  expect(screen.getByLabelText('BTC price on decision day')).toHaveValue(
    '90.00',
  );
  expect(screen.getByRole('button', { name: /^Call contract/ })).toBeDisabled();
  fireEvent.submit(document.getElementById('strategy-calculator')!);
  expect(screen.queryByText(/Same result/)).not.toBeInTheDocument();
});
it('derives the previous day from the decision day and submits edits', async () => {
  render(<StrategyCalculator data={dataset} />);
  fireEvent.change(screen.getByLabelText('Decision day'), {
    target: { value: '2025-10-19' },
  });
  expect(screen.getAllByText('Oct 19')).toHaveLength(3);
  expect(screen.getAllByText('Oct 18')).toHaveLength(3);
  fireEvent.change(screen.getByLabelText('Decision day'), {
    target: { value: '' },
  });
  expect(screen.getByLabelText('Decision day')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(screen.getByRole('button', { name: /^Call contract/ })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Decision day'), {
    target: { value: '2025-10-19' },
  });
  fireEvent.change(screen.getByLabelText('Last exit executed'), {
    target: { value: '2025-10-10' },
  });
  fireEvent.submit(document.getElementById('strategy-calculator')!);
  await screen.findByText(
    'Custom inputs, so there is no historical comparison.',
  );
});
it('shows full precision while editing and rounds at rest', () => {
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  const cell = screen.getByLabelText('BTC 200-day average on previous day');
  fireEvent.change(cell, { target: { value: '107535.29506345' } });
  expect(cell).toHaveValue('107,535.30');
  fireEvent.focus(cell);
  expect(cell).toHaveValue('107535.29506345');
  fireEvent.blur(cell);
  expect(cell).toHaveValue('107,535.30');
  expect(screen.getByText('Python backtest on 2025-10-18')).toBeInTheDocument();
});
it('copies the full codehash with an accessible failure fallback', async () => {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
  });
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy codehash' }));
  await screen.findByRole('button', { name: 'Select codehash to copy' });
  vi.mocked(navigator.clipboard.writeText).mockResolvedValue(undefined);
  fireEvent.click(
    screen.getByRole('button', { name: 'Select codehash to copy' }),
  );
  await screen.findByRole('button', { name: 'Copied' });
  expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(
    dataset.runtimeCodehash,
  );
});

it('shows missing data when an asset has no usable numbers', () => {
  render(
    <AssetCrossTrack
      asset="BTC"
      previous={{ price: '0', dma: '100' }}
      current={{ price: '90', dma: '100' }}
    />,
  );
  expect(screen.getByText('Missing data')).toBeInTheDocument();
  cleanup();
  render(
    <AssetCrossTrack
      asset="BTC"
      previous={{ price: 'invalid', dma: '100' }}
      current={{ price: '90', dma: '100' }}
    />,
  );
  expect(screen.getByText('Missing data')).toBeInTheDocument();
});

it('draws a flat line when price equals its average', () => {
  render(
    <AssetCrossTrack
      asset="BTC"
      previous={{ price: '100', dma: '100' }}
      current={{ price: '100', dma: '100' }}
    />,
  );
  expect(
    screen.getByRole('img', { name: /BTC: yesterday/ }),
  ).toBeInTheDocument();
  expect(screen.getByText('+0.00% → +0.00%')).toBeInTheDocument();
});

it('marks the last exit invalid when the date cannot be parsed', () => {
  const onChange = vi.fn();
  const input = inputFromExample(example);
  render(
    <CalculatorForm
      input={input}
      onChange={onChange}
      running={false}
      onRun={vi.fn()}
    />,
  );
  fireEvent.change(screen.getByLabelText('Last exit executed'), {
    target: { value: '1969-12-31' },
  });
  expect(onChange).toHaveBeenCalledWith(
    expect.objectContaining({ lastExecutedDay: -1 }),
  );
});

it('does not submit while inputs are invalid', () => {
  const onRun = vi.fn();
  const input = { ...inputFromExample(example), date: '' };
  render(
    <CalculatorForm
      input={input}
      onChange={vi.fn()}
      running={false}
      onRun={onRun}
    />,
  );
  fireEvent.submit(document.getElementById('strategy-calculator')!);
  expect(onRun).not.toHaveBeenCalled();
  cleanup();
  const badAllocation = {
    ...inputFromExample(example),
    allocation: ['101', '0', '0', '0', '0'],
  };
  render(
    <CalculatorForm
      input={badAllocation}
      onChange={vi.fn()}
      running={false}
      onRun={vi.fn()}
    />,
  );
  expect(screen.getAllByText(/between 0 and 100%/)).toHaveLength(2);
});

it('copies verification commands and reports clipboard failure', async () => {
  const result = await runCalculator(inputFromExample(example), dataset);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) },
  });
  render(<VerifyYourself result={result} deployment={dataset.deployment!} />);
  fireEvent.click(
    screen.getAllByRole('button', { name: /Copy .* cast command/ })[0]!,
  );
  await screen.findByText(/Copy unavailable/);
});

it('highlights changed allocations and tolerates a short comparison', () => {
  const before = [
    WAD / 4n,
    WAD / 4n,
    WAD / 4n,
    WAD / 4n,
  ] as unknown as readonly bigint[];
  render(<AllocationCompare before={before} after={before} />);
  expect(document.querySelector('.calc-changed')).toBeNull();
  cleanup();
  render(
    <AllocationCompare
      before={before}
      after={before.slice(0, 2) as unknown as readonly bigint[]}
    />,
  );
  expect(screen.getAllByText('Before').length).toBeGreaterThan(0);
});

it('keeps the entered allocation when the contract does not match', async () => {
  const result = await runCalculator(inputFromExample(example), dataset);
  const unmatched = {
    ...result,
    exit: { ...result.exit, matched: false },
  };
  render(
    <ContractAnswer
      result={unmatched}
      submitted={inputFromExample(example)}
      example={example}
      data={dataset}
      stale={false}
      historical={true}
      running={false}
      disabled={false}
      error=""
    />,
  );
  expect(
    screen.getByText('The allocation stays as entered.'),
  ).toBeInTheDocument();
});

it('reports a failed bytecode check', async () => {
  state.verifyFail = 'error';
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText('Bytecode check failed');
});

it('reports a non-Error bytecode failure', async () => {
  state.verifyFail = 'string';
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText('Bytecode check failed');
});

it('explains codehash failures when calling', async () => {
  state.runFail = 'codehash';
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText(/Codehash matches/);
  fireEvent.click(screen.getByRole('button', { name: /^Call contract/ }));
  await screen.findByText(/pinned artifact/);
});

it('explains network failures when calling', async () => {
  state.runFail = 'network';
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText(/Codehash matches/);
  fireEvent.click(screen.getByRole('button', { name: /^Call contract/ }));
  await screen.findByText(/Arbitrum Sepolia RPC/);
});

it('reports non-Error calculation failures', async () => {
  state.runFail = 'string';
  render(<StrategyCalculator data={dataset} />);
  await screen.findByText(/Codehash matches/);
  fireEvent.click(screen.getByRole('button', { name: /^Call contract/ }));
  await screen.findByText(/RPC calculation failed/);
});

it('drops bytecode verification that settles after unmount', async () => {
  state.verifyFail = 'error';
  const { unmount } = render(<StrategyCalculator data={dataset} />);
  unmount();
  await act(async () => {});
  expect(screen.queryByText('Bytecode check failed')).not.toBeInTheDocument();
});

it('adopts a fresh Rabby deployment', async () => {
  const deployment = {
    ...dataset.deployment!,
    transactionHash: `0x${'44'.repeat(32)}` as `0x${string}`,
    blockNumber: '7',
  };
  vi.mocked(deployStrategy).mockResolvedValue(deployment);
  render(<StrategyCalculator data={{ ...dataset, deployment: null }} />);
  expect(screen.getByText(/Deploy with Rabby/)).toBeInTheDocument();
  const rabby = {
    request: vi.fn().mockResolvedValue(['0xabc']),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  act(() => {
    window.dispatchEvent(
      new CustomEvent('eip6963:announceProvider', {
        detail: { info: { rdns: 'io.rabby' }, provider: rabby },
      }),
    );
  });
  fireEvent.click(screen.getByRole('button', { name: 'Connect Rabby wallet' }));
  await screen.findByText(/Connected:/);
  fireEvent.click(
    screen.getByRole('button', { name: 'Deploy to Arbitrum Sepolia' }),
  );
  await screen.findByText(/Codehash matches/);
  expect(screen.queryByText(/Deploy with Rabby/)).not.toBeInTheDocument();
});
