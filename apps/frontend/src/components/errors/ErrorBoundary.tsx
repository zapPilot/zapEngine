import { Component, ErrorInfo, ReactNode } from 'react';

import { isRuntimeMode } from '@/lib/env/runtimeEnv';
import { logger } from '@/utils';

import { BaseCard } from '../ui/BaseCard';
import { GradientButton } from '../ui/GradientButton';

const errorLogger = logger.createContextLogger('ErrorBoundary');

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetOnPropsChange?: boolean;
  resetKeys?: (string | number)[];
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  eventId: string | null;
}

/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree and displays
 * a fallback UI instead of crashing the whole app.
 *
 * **Note on Class Component Implementation:**
 * This is intentionally implemented as a React class component, which is an
 * exception to our modern React patterns. As of React 19, error boundaries
 * can only be implemented using class components with lifecycle methods.
 * React does not yet provide a functional component alternative for error boundaries.
 *
 * This component uses the following lifecycle methods:
 * - `static getDerivedStateFromError()` - Updates state when an error is caught
 * - `componentDidCatch()` - Logs error details and triggers callbacks
 * - `componentDidUpdate()` - Handles automatic error recovery on prop changes
 * - `componentWillUnmount()` - Cleanup for timers and resources
 *
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 *
 * **Future:** Monitor React for functional error boundary support. When available,
 * this component should be migrated to use the new functional API.
 */
export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;
  private static errorIdCounter = 0;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error details
    errorLogger.error('ErrorBoundary caught an error', { error, errorInfo });

    // Update state with error info
    this.setState({
      errorInfo,
      eventId: this.generateEventId(),
    });

    // Call optional error handler
    this.props.onError?.(error, errorInfo);

    // Report to error tracking service (if configured)
    this.reportError();
  }

  override componentDidUpdate(prevProps: Props) {
    const { resetOnPropsChange, resetKeys } = this.props;
    const { hasError } = this.state;

    // Reset error boundary when resetKeys change
    if (
      hasError &&
      prevProps.resetKeys !== resetKeys &&
      resetKeys?.some((key, idx) => prevProps.resetKeys?.[idx] !== key)
    ) {
      this.resetErrorBoundary();
    }

    // Reset error boundary when props change (if enabled)
    if (
      hasError &&
      resetOnPropsChange &&
      prevProps.children !== this.props.children
    ) {
      this.resetErrorBoundary();
    }
  }

  override componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
  }

  private generateEventId(): string {
    ErrorBoundary.errorIdCounter += 1;
    // eslint-disable-next-line sonarjs/deprecation -- Legacy browser compatibility
    return `${Date.now()}-${ErrorBoundary.errorIdCounter}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private reportError() {
    // In a real app, you would send this to an error tracking service
    // like Sentry, Bugsnag, LogRocket, etc.
    if (isRuntimeMode('production')) {
      // Example error reporting
      // Sentry.captureException(error, {
      //   contexts: {
      //     react: {
      //       componentStack: errorInfo.componentStack,
      //     },
      //   },
      // });
    }
  }

  private resetErrorBoundary = () => {
    // Reset the error boundary state
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      eventId: null,
    });
  };

  private handleRetry = () => {
    this.resetErrorBoundary();
  };

  private handleReload = () => {
    window.location.reload();
  };

  override render() {
    const { hasError, error, eventId } = this.state;
    const { children, fallback } = this.props;

    if (hasError) {
      // Custom fallback UI provided
      if (fallback) {
        return fallback;
      }

      // Default error UI
      return (
        <div className="min-h-screen flex items-center justify-center p-4">
          <BaseCard variant="glass" className="max-w-lg w-full">
            <div className="text-center space-y-6">
              {/* Error Icon */}
              <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center">
                <svg
                  className="w-8 h-8 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
                  />
                </svg>
              </div>

              {/* Error Message */}
              <div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">
                  Oops! Something went wrong
                </h2>
                <p className="text-gray-600 mb-4">
                  We encountered an unexpected error. This has been logged and
                  our team will investigate.
                </p>

                {/* Error Details (Development only) */}
                {isRuntimeMode('development') && error && (
                  <details className="text-left">
                    <summary className="cursor-pointer text-sm font-medium text-gray-700 mb-2">
                      Error Details
                    </summary>
                    <div className="bg-gray-50 p-3 rounded border text-xs font-mono text-red-700 whitespace-pre-wrap">
                      <div className="font-bold">Error:</div>
                      <div className="mb-2">{error.message}</div>
                      <div className="font-bold">Stack:</div>
                      <div>{error.stack}</div>
                    </div>
                  </details>
                )}

                {/* Event ID for support */}
                {eventId && (
                  <p className="text-xs text-gray-500 mt-4">
                    Error ID: {eventId}
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <GradientButton
                  onClick={this.handleRetry}
                  gradient="from-blue-500 to-purple-600"
                  shadowColor="blue"
                  className="flex-1 sm:flex-none px-6 py-3"
                >
                  Try Again
                </GradientButton>
                <GradientButton
                  onClick={this.handleReload}
                  gradient="from-gray-500 to-gray-600"
                  shadowColor="gray"
                  className="flex-1 sm:flex-none px-6 py-3"
                >
                  Reload Page
                </GradientButton>
              </div>

              {/* Additional Help */}
              <div className="text-sm text-gray-500">
                <p>
                  If this problem persists, please{' '}
                  <a
                    href="mailto:support@zappilot.com"
                    className="text-blue-600 hover:text-blue-800 underline"
                  >
                    contact support
                  </a>
                  {eventId && ` and include the error ID: ${eventId}`}
                </p>
              </div>
            </div>
          </BaseCard>
        </div>
      );
    }

    return children;
  }
}
