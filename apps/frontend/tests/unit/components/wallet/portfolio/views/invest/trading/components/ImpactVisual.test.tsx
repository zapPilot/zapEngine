import { describe, expect, it, vi } from 'vitest';

import { ImpactVisual } from '@/components/wallet/portfolio/views/invest/trading/components/ImpactVisual';

import { render, screen } from '../../../../../../../../test-utils';

vi.mock(
  '@/components/wallet/portfolio/components/allocation',
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import('@/components/wallet/portfolio/components/allocation')
    >()),
    UnifiedAllocationBar: (props: {
      title?: string;
      testIdPrefix?: string;
      segments: { category: string; label: string; percentage: number }[];
    }) => (
      <div
        data-testid={props.testIdPrefix ?? 'impact-bar'}
        data-title={props.title}
        data-segments={JSON.stringify(props.segments)}
      />
    ),
  }),
);

vi.mock('lucide-react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('lucide-react')>()),
  ArrowRight: () => <svg data-testid="arrow-right" />,
}));

describe('ImpactVisual', () => {
  const currentAllocation = {
    btc: 0.35,
    eth: 0.25,
    stable: 0.3,
    alt: 0.1,
  } as const;

  const targetAllocation = {
    btc: 0.6,
    eth: 0.1,
    stable: 0.3,
    alt: 0,
  } as const;

  function readSegments(testId: string) {
    const rawSegments = screen
      .getByTestId(testId)
      .getAttribute('data-segments');
    expect(rawSegments).toBeTruthy();
    return JSON.parse(rawSegments ?? '[]') as {
      category: string;
      label: string;
      percentage: number;
    }[];
  }

  it('renders heading and current/target allocation bars', () => {
    render(
      <ImpactVisual
        currentAllocation={currentAllocation}
        targetAllocation={targetAllocation}
      />,
    );

    expect(screen.getByText('Allocation Impact')).toBeInTheDocument();
    expect(screen.getByTestId('impact-current')).toHaveAttribute(
      'data-title',
      'Current',
    );
    expect(screen.getByTestId('impact-target')).toHaveAttribute(
      'data-title',
      'Target',
    );
  });

  it('renders ALT in the current allocation segments', () => {
    render(
      <ImpactVisual
        currentAllocation={currentAllocation}
        targetAllocation={targetAllocation}
      />,
    );

    expect(readSegments('impact-current')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: 'alt',
          label: 'ALT',
          percentage: 10,
        }),
      ]),
    );
  });

  it('omits ALT from the target allocation segments', () => {
    render(
      <ImpactVisual
        currentAllocation={currentAllocation}
        targetAllocation={targetAllocation}
      />,
    );

    expect(
      readSegments('impact-target').map((segment) => segment.category),
    ).toEqual(['btc', 'stable', 'eth']);
  });

  it('renders ArrowRight connector', () => {
    render(
      <ImpactVisual
        currentAllocation={currentAllocation}
        targetAllocation={targetAllocation}
      />,
    );

    expect(screen.getByTestId('arrow-right')).toBeInTheDocument();
  });
});
