/**
 * LogViewer - Unit Tests
 *
 * Tests the LogViewer component rendering and functionality.
 * Note: In development, LogViewer renders when VITE_ENABLE_LOG_VIEWER=1.
 * With VITE_ENABLE_DEBUG_LOGGING=true it also renders (e.g. production diagnostics).
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Import after mocking
import { LogViewer } from '@/components/debug/LogViewer';
import { logger, LogLevel } from '@/utils/logger';

// Mock the logger module before importing the component
vi.mock('@/utils/logger', () => ({
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
  logger: {
    getLogs: vi.fn(() => []),
    clearLogs: vi.fn(),
  },
}));

describe('LogViewer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('VITE_ENABLE_LOG_VIEWER', '1');
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it('should render toggle button with log count', () => {
    vi.mocked(logger.getLogs).mockReturnValue([]);
    render(<LogViewer />);

    expect(screen.getByText(/🐛 Logs/)).toBeInTheDocument();
  });

  it('should toggle visibility when clicking the button', async () => {
    vi.mocked(logger.getLogs).mockReturnValue([]);
    render(<LogViewer />);

    // Initially the log panel should not be visible
    expect(screen.queryByText('Development Logs')).not.toBeInTheDocument();

    // Click to show
    fireEvent.click(screen.getByText(/🐛 Logs/));
    expect(screen.getByText('Development Logs')).toBeInTheDocument();

    // Click to hide
    fireEvent.click(screen.getByText(/🐛 Logs/));
    expect(screen.queryByText('Development Logs')).not.toBeInTheDocument();
  });

  it('should render logs from logger service', async () => {
    const mockLogs = [
      {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        message: 'App started',
        context: 'main',
      },
      {
        timestamp: Date.now(),
        level: LogLevel.WARN,
        message: 'Connection slow',
      },
      {
        timestamp: Date.now(),
        level: LogLevel.ERROR,
        message: 'Request failed',
      },
    ];
    vi.mocked(logger.getLogs).mockReturnValue(mockLogs);

    const { rerender } = render(<LogViewer />);

    // Click to show panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Advance timer by 1 second to trigger the interval callback
    await vi.advanceTimersByTimeAsync(1000);

    // Re-render to pick up state change
    rerender(<LogViewer />);

    expect(screen.getByText('App started')).toBeInTheDocument();
  });

  it('should clear logs when clicking Clear button', async () => {
    vi.mocked(logger.getLogs).mockReturnValue([]);
    render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Click clear button
    fireEvent.click(screen.getByText('Clear'));

    expect(logger.clearLogs).toHaveBeenCalled();
  });

  it('should have filter level dropdown', () => {
    vi.mocked(logger.getLogs).mockReturnValue([]);
    render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Should have filter options
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('DEBUG+')).toBeInTheDocument();
  });

  it('should render with debug logging flag enabled in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITE_ENABLE_DEBUG_LOGGING', 'true');
    vi.mocked(logger.getLogs).mockReturnValue([]);

    render(<LogViewer />);
    expect(screen.getByText(/🐛 Logs/)).toBeInTheDocument();
  });

  it('should render string data in renderData', async () => {
    const mockLogs = [
      {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        message: 'Request completed',
        data: 'some string data',
      },
    ];
    vi.mocked(logger.getLogs).mockReturnValue(mockLogs);

    const { rerender } = render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Advance timer to trigger interval callback
    await vi.advanceTimersByTimeAsync(1000);
    rerender(<LogViewer />);

    // Check that string data is rendered in a pre element
    const preElement = screen.getByText('some string data');
    expect(preElement).toBeInTheDocument();
    expect(preElement.tagName).toBe('PRE');
  });

  it('should render object data with JSON.stringify in renderData', async () => {
    const mockLogs = [
      {
        timestamp: Date.now(),
        level: LogLevel.DEBUG,
        message: 'API response',
        data: { key: 'value', nested: { prop: 123 } },
      },
    ];
    vi.mocked(logger.getLogs).mockReturnValue(mockLogs);

    const { rerender } = render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Advance timer
    await vi.advanceTimersByTimeAsync(1000);
    rerender(<LogViewer />);

    // Check that JSON stringified data is rendered
    expect(screen.getByText(/"key": "value"/)).toBeInTheDocument();
    expect(screen.getByText(/"prop": 123/)).toBeInTheDocument();
  });

  it('should render [Object] when JSON.stringify throws in renderData', async () => {
    // Create a circular reference object
    const circularObj: Record<string, unknown> = { a: 1 };
    circularObj.self = circularObj;

    const mockLogs = [
      {
        timestamp: Date.now(),
        level: LogLevel.ERROR,
        message: 'Circular data',
        data: circularObj,
      },
    ];
    vi.mocked(logger.getLogs).mockReturnValue(mockLogs);

    const { rerender } = render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Advance timer
    await vi.advanceTimersByTimeAsync(1000);
    rerender(<LogViewer />);

    // Check that [Object] is rendered due to stringify error
    expect(screen.getByText('[Object]')).toBeInTheDocument();
  });

  it('should not render data section when data is null', async () => {
    const mockLogs = [
      {
        timestamp: Date.now(),
        level: LogLevel.WARN,
        message: 'Warning without data',
        data: null,
      },
    ];
    vi.mocked(logger.getLogs).mockReturnValue(mockLogs);

    const { rerender } = render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Advance timer
    await vi.advanceTimersByTimeAsync(1000);
    rerender(<LogViewer />);

    // Check message is rendered
    expect(screen.getByText('Warning without data')).toBeInTheDocument();

    // Check that no pre element for data is rendered
    const preElements = document.querySelectorAll('pre');
    expect(preElements.length).toBe(0);
  });

  it('should filter logs by level when changing filter dropdown', async () => {
    const mockLogs = [
      {
        timestamp: Date.now(),
        level: LogLevel.DEBUG,
        message: 'Debug message',
      },
      {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        message: 'Info message',
      },
      {
        timestamp: Date.now(),
        level: LogLevel.WARN,
        message: 'Warn message',
      },
    ];
    vi.mocked(logger.getLogs).mockReturnValue(mockLogs);

    const { rerender } = render(<LogViewer />);

    // Open the panel
    fireEvent.click(screen.getByText(/🐛 Logs/));

    // Advance timer to render logs
    await vi.advanceTimersByTimeAsync(1000);
    rerender(<LogViewer />);

    // Initially all logs should be visible (DEBUG+ filter)
    expect(screen.getByText('Debug message')).toBeInTheDocument();
    expect(screen.getByText('Info message')).toBeInTheDocument();
    expect(screen.getByText('Warn message')).toBeInTheDocument();

    // Change filter to INFO
    const filterSelect = screen.getByRole('combobox');
    fireEvent.change(filterSelect, { target: { value: '1' } });

    // Advance timer to trigger re-render
    await vi.advanceTimersByTimeAsync(1000);
    rerender(<LogViewer />);

    // DEBUG should be filtered out, INFO and WARN should remain
    expect(screen.queryByText('Debug message')).not.toBeInTheDocument();
    expect(screen.getByText('Info message')).toBeInTheDocument();
    expect(screen.getByText('Warn message')).toBeInTheDocument();
  });
});
