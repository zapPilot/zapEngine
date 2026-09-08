import { Component, type ReactNode } from 'react';

export type SentryScopeStandIn = {
  setTag: (key: string, value: string) => void;
};

export type CapturedRenderError = {
  error: unknown;
  tags: Record<string, string>;
};

type ErrorBoundaryStandInProps = {
  children?: ReactNode;
  fallback?: (props: { error: unknown; resetError: () => void }) => ReactNode;
  beforeCapture?: (scope: SentryScopeStandIn, error: unknown) => void;
};

/**
 * A minimal stand-in for `@sentry/react-native`'s `ErrorBoundary` (itself
 * re-exported from `@sentry/react`): catches render errors from its subtree,
 * runs `beforeCapture` against a scope that only records tags, reports what
 * Sentry would have captured, and renders `fallback` instead of crashing.
 *
 * The capture sink is a parameter rather than a module-level spy because each
 * test file owns its own `vi.hoisted` mock. Call this from inside the
 * `vi.mock` factory via `await import(...)`: factories are hoisted above
 * imports, so a top-level import of this module would be in its TDZ there.
 *
 * The extension is `.tsx` deliberately: `knip.ts` scopes its test `project`
 * glob to the `.ts` extension, so a `.ts` helper imported only from
 * `.test.tsx` files is reported as an unused file.
 */
export function createSentryErrorBoundaryStandIn(
  onCapturedError: (captured: CapturedRenderError) => void,
) {
  return class ErrorBoundary extends Component<
    ErrorBoundaryStandInProps,
    { error: unknown }
  > {
    state: { error: unknown } = { error: null };

    static getDerivedStateFromError(error: unknown) {
      return { error };
    }

    override componentDidCatch(error: unknown) {
      const tags: Record<string, string> = {};
      this.props.beforeCapture?.(
        {
          setTag: (key, value) => {
            tags[key] = value;
          },
        },
        error,
      );
      onCapturedError({ error, tags });
    }

    resetError = () => this.setState({ error: null });

    override render() {
      if (this.state.error) {
        return this.props.fallback?.({
          error: this.state.error,
          resetError: this.resetError,
        });
      }
      return this.props.children;
    }
  };
}
