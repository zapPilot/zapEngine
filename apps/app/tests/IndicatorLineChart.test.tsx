// @vitest-environment jsdom

import {
  act,
  createElement,
  type HTMLAttributes,
  type ReactNode,
  useLayoutEffect,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';

import { IndicatorLineChart } from '@/components/charts/IndicatorLineChart';

vi.mock('react-native', () => ({
  View: ({
    children,
    onLayout,
    ...props
  }: HTMLAttributes<HTMLDivElement> & {
    children?: ReactNode;
    onLayout?: (event: {
      nativeEvent: { layout: { width: number; height: number } };
    }) => void;
  }) => {
    useLayoutEffect(
      () =>
        onLayout?.({ nativeEvent: { layout: { width: 240, height: 120 } } }),
      [onLayout],
    );
    return <div {...props}>{children}</div>;
  },
}));

vi.mock('react-native-svg', () => {
  const element = (name: string) => {
    function MockSvgElement({
      children,
      ...props
    }: HTMLAttributes<HTMLElement> & { children?: ReactNode }) {
      return createElement(name, props, children);
    }
    return MockSvgElement;
  };
  return {
    default: element('svg'),
    Defs: element('defs'),
    LinearGradient: element('linearGradient'),
    Path: element('path'),
    Stop: element('stop'),
  };
});

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('IndicatorLineChart', () => {
  it('renders a series and splits nullable DMA overlay into dashed segments', async () => {
    await act(async () =>
      root.render(
        <IndicatorLineChart
          series={[10, 12, 11, 14, 15]}
          overlay={[9, 10, null, 12, 13]}
        />,
      ),
    );
    const paths = [...container.querySelectorAll('path')];
    expect(paths.length).toBe(4);
    expect(
      paths.filter((path) => path.getAttribute('stroke-dasharray') === '5 4'),
    ).toHaveLength(2);
  });

  it('renders nothing for fewer than two series points', async () => {
    await act(async () =>
      root.render(<IndicatorLineChart series={[1]} overlay={[null]} />),
    );
    expect(container.innerHTML).toBe('');
  });
});
