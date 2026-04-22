import { useEffect } from 'react';

import { logger } from '@/utils';

const globalErrorLogger = logger.createContextLogger('GlobalErrorHandler');

/**
 * Global Error Handler Component
 *
 * Catches unhandled promise rejections and global errors
 * that occur outside of React component boundaries
 */
export function GlobalErrorHandler() {
  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      globalErrorLogger.error('Unhandled Promise Rejection', {
        reason: event.reason,
        stack: event.reason?.stack,
      });

      // Prevent the default handling (which logs to console)
      event.preventDefault();
    };

    // Handle global errors
    const handleGlobalError = (event: ErrorEvent) => {
      globalErrorLogger.error('Global Error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error,
      });
    };

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    // Cleanup
    return () => {
      window.removeEventListener(
        'unhandledrejection',
        handleUnhandledRejection,
      );
      window.removeEventListener('error', handleGlobalError);
    };
  }, []);

  return null; // This component doesn't render anything
}
