import {
  type ComponentType,
  createElement,
  lazy,
  type ReactElement,
  type ReactNode,
  Suspense,
} from 'react';

export interface LazyImportOptions {
  fallback?: ReactNode;
}

/**
 * Lazily load a named export and wrap it with a local `Suspense` boundary.
 *
 * @param loader - Dynamic import that resolves the source module.
 * @param selectExport - Selector that returns the component export to render.
 * @param options - Optional suspense fallback.
 * @returns A component that lazy-loads the selected export.
 *
 * @example
 * ```tsx
 * const LazyWidget = lazyImport(() => import("./Widget"), mod => mod.Widget);
 * ```
 */
export function lazyImport<TModule, TProps>(
  loader: () => Promise<TModule>,
  selectExport: (module: TModule) => ComponentType<TProps>,
  options?: LazyImportOptions,
): ComponentType<TProps> {
  const LazyComponent = lazy(async () => {
    const module = await loader();
    return { default: selectExport(module) };
  });
  const ResolvedLazyComponent = LazyComponent as ComponentType<TProps>;

  function WrappedComponent(props: TProps): ReactElement {
    return (
      <Suspense fallback={options?.fallback ?? null}>
        {createElement(
          ResolvedLazyComponent as ComponentType<Record<string, unknown>>,
          props as Record<string, unknown>,
        )}
      </Suspense>
    );
  }

  WrappedComponent.displayName = 'LazyImport';

  return WrappedComponent;
}
