import { Children, cloneElement, isValidElement, type ReactNode } from "react";

type MockRenderer<TProps> = (props: TProps) => ReactNode;

interface RechartsMockComponent<TProps> {
  (props: TProps): null;
  __mockRenderer?: MockRenderer<TProps>;
}

/**
 * Create a Recharts mock component whose props can be captured without
 * rendering unsupported SVG tags into jsdom.
 *
 * @param renderer - Optional renderer used by the chart container.
 * @returns A mock Recharts component that renders `null` by default.
 *
 * @example
 * const XAxis = createRechartsMockComponent(({ tickFormatter }) => {
 *   capturedTickFormatter = tickFormatter ?? null;
 *   return null;
 * });
 */
export const createRechartsMockComponent = <TProps,>(
  renderer?: MockRenderer<TProps>
): RechartsMockComponent<TProps> => {
  const MockComponent = (() => null) as RechartsMockComponent<TProps>;
  MockComponent.__mockRenderer = renderer;
  return MockComponent;
};

const renderMockChildren = (
  children: ReactNode,
  keyState: { value: number } = { value: 0 }
): ReactNode[] => {
  const renderedChildren: ReactNode[] = [];

  Children.forEach(children, child => {
    if (!isValidElement(child) || typeof child.type === "string") {
      return;
    }

    const component = child.type as RechartsMockComponent<
      Record<string, unknown>
    >;
    const renderedChild = component.__mockRenderer?.(
      child.props as Record<string, unknown>
    );

    if (renderedChild != null) {
      renderedChildren.push(
        isValidElement(renderedChild) && renderedChild.key == null
          ? cloneElement(renderedChild, {
              key: `recharts-mock-${keyState.value++}`,
            })
          : renderedChild
      );
      return;
    }

    if (typeof child.type === "function") {
      renderedChildren.push(
        ...renderMockChildren(
          child.type(child.props as Record<string, unknown>) as ReactNode,
          keyState
        )
      );
    }
  });

  return renderedChildren;
};

/**
 * Create a Recharts chart container mock that walks its children and renders
 * only explicitly mocked Recharts components.
 *
 * @returns A mock chart container component.
 *
 * @example
 * const ComposedChart = createRechartsChartContainer();
 */
export const createRechartsChartContainer = () => {
  const MockChartContainer = ({ children }: { children?: ReactNode }) => {
    return <div>{renderMockChildren(children)}</div>;
  };

  MockChartContainer.displayName = "MockRechartsChartContainer";

  return MockChartContainer;
};
