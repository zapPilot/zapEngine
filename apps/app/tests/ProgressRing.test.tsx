// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProgressRing } from '@/components/ui/ProgressRing';

vi.mock('react-native', () => ({
  View: ({
    children,
    style,
    ...rest
  }: {
    children?: ReactNode;
    style?: { width?: number; transform?: object[] };
  }) => (
    <div
      data-transform={JSON.stringify(style?.transform ?? null)}
      data-width={style?.width}
      data-hidden={String(rest['aria-hidden' as never])}
    >
      {children}
    </div>
  ),
}));
vi.mock('react-native-svg', () => ({
  default: ({ children }: { children?: ReactNode }) => <svg>{children}</svg>,
  Circle: (props: Record<string, unknown>) => (
    <circle data-props={JSON.stringify(props)} />
  ),
}));

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function arc(node: ReactNode) {
  await act(async () => root.render(node));
  const circles = [...container.querySelectorAll('circle')].map((circle) =>
    JSON.parse(circle.getAttribute('data-props')!),
  );
  return { track: circles[0], arc: circles[1] };
}
const circumference = (size: number, stroke: number) =>
  2 * Math.PI * ((size - stroke) / 2);

describe('ProgressRing', () => {
  it('draws a full track and an arc whose gap tracks the value', async () => {
    const { track, arc: progress } = await arc(<ProgressRing value={25} />);
    const length = circumference(44, 2);
    expect(track.r).toBe(21);
    expect(track.strokeDasharray).toBeUndefined();
    expect(progress.strokeDasharray).toBeCloseTo(length);
    expect(progress.strokeDashoffset).toBeCloseTo(length * 0.75);
    expect(progress.strokeLinecap).toBe('round');
    expect(progress.fill).toBe('none');
  });

  it.each([
    [0, 1],
    [100, 0],
    [250, 0],
    [-30, 1],
    [Number.NaN, 1],
  ])('maps value %s to %s of the arc hidden', async (value, hidden) => {
    const { arc: progress } = await arc(<ProgressRing value={value} />);
    expect(progress.strokeDashoffset).toBeCloseTo(
      circumference(44, 2) * hidden,
    );
  });

  it('scales to the requested size and stroke', async () => {
    const { track, arc: progress } = await arc(
      <ProgressRing value={50} size={60} strokeWidth={4} />,
    );
    expect(track.cx).toBe(30);
    expect(track.r).toBe(28);
    expect(progress.strokeWidth).toBe(4);
    expect(progress.strokeDasharray).toBeCloseTo(circumference(60, 4));
    expect(container.querySelector('div')?.getAttribute('data-width')).toBe(
      '60',
    );
  });

  it('starts the arc at twelve o’clock by turning the drawing a quarter back', async () => {
    await arc(<ProgressRing value={10} />);
    expect(
      [...container.querySelectorAll('div')].map((node) =>
        node.getAttribute('data-transform'),
      ),
    ).toContain('[{"rotate":"-90deg"}]');
  });

  it('stays out of the accessibility tree and hosts centred content', async () => {
    await arc(
      <ProgressRing value={10}>
        <span>centre</span>
      </ProgressRing>,
    );
    expect(container.querySelector('div')?.getAttribute('data-hidden')).toBe(
      'true',
    );
    expect(container.textContent).toBe('centre');
  });
});
