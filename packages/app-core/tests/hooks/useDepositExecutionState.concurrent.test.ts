// @vitest-environment jsdom
import { useDepositExecutionState } from '@core/hooks/useDepositExecutionState';
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const TX_HASH =
  '0x1111111111111111111111111111111111111111111111111111111111111111' as const;

describe('useDepositExecutionState concurrency', () => {
  it('does not let an older failed run overwrite a newer pending run', async () => {
    let rejectFirst!: (error: Error) => void;
    let resolveSecond!: (value: string) => void;
    const firstError = new Error('stale execution failed');
    const onFirstError = vi.fn();
    const onSecondError = vi.fn();

    const { result } = renderHook(() => useDepositExecutionState());

    let firstRun!: Promise<string>;
    let secondRun!: Promise<string>;
    act(() => {
      firstRun = result.current.actions.run(
        () =>
          new Promise<string>((_resolve, reject) => {
            rejectFirst = reject;
          }),
        onFirstError,
      );
      secondRun = result.current.actions.run(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve;
          }),
        onSecondError,
      );
    });

    expect(result.current.state.pending).toBe(true);
    expect(result.current.state.lastError).toBeNull();

    await act(async () => {
      rejectFirst(firstError);
      await expect(firstRun).rejects.toBe(firstError);
    });

    expect(onFirstError).toHaveBeenCalledOnce();
    expect(onFirstError).toHaveBeenCalledWith(firstError);
    expect(onSecondError).not.toHaveBeenCalled();
    expect(result.current.state.pending).toBe(true);
    expect(result.current.state.lastError).toBeNull();

    await act(async () => {
      resolveSecond('newer result');
      await expect(secondRun).resolves.toBe('newer result');
    });

    expect(result.current.state.pending).toBe(false);
    expect(result.current.state.lastError).toBeNull();
  });

  it('does not let an older successful run clear a newer pending run', async () => {
    let resolveFirst!: (value: string) => void;
    let resolveSecond!: (value: string) => void;
    const onFirstError = vi.fn();
    const onSecondError = vi.fn();

    const { result } = renderHook(() => useDepositExecutionState());

    let firstRun!: Promise<string>;
    let secondRun!: Promise<string>;
    act(() => {
      firstRun = result.current.actions.run(
        () =>
          new Promise<string>((resolve) => {
            resolveFirst = resolve;
          }),
        onFirstError,
      );
      secondRun = result.current.actions.run(
        () =>
          new Promise<string>((resolve) => {
            resolveSecond = resolve;
          }),
        onSecondError,
      );
    });

    expect(result.current.state.pending).toBe(true);

    await act(async () => {
      resolveFirst('stale result');
      await expect(firstRun).resolves.toBe('stale result');
    });

    expect(onFirstError).not.toHaveBeenCalled();
    expect(onSecondError).not.toHaveBeenCalled();
    expect(result.current.state.pending).toBe(true);
    expect(result.current.state.lastError).toBeNull();

    await act(async () => {
      resolveSecond('newer result');
      await expect(secondRun).resolves.toBe('newer result');
    });

    expect(result.current.state.pending).toBe(false);
    expect(result.current.state.lastError).toBeNull();
  });

  it('clears prior transaction metadata as soon as a newer run starts', async () => {
    const onFirstError = vi.fn();
    const onSecondError = vi.fn();
    let resolveSecond!: () => void;

    const { result } = renderHook(() => useDepositExecutionState());

    await act(async () => {
      await result.current.actions.run(async () => {
        result.current.actions.markBundleSubmitted('calls-previous');
        result.current.actions.markBundleConfirmed(TX_HASH);
        return 'previous result';
      }, onFirstError);
    });

    expect(result.current.state.pending).toBe(false);
    expect(result.current.state.tier).toBe('eip7702');
    expect(result.current.state.lastCallsId).toBe('calls-previous');
    expect(result.current.state.lastTxHash).toBe(TX_HASH);

    let secondRun!: Promise<void>;
    act(() => {
      secondRun = result.current.actions.run(
        () =>
          new Promise<void>((resolve) => {
            resolveSecond = resolve;
          }),
        onSecondError,
      );
    });

    expect(result.current.state.pending).toBe(true);
    expect(result.current.state.tier).toBeNull();
    expect(result.current.state.lastCallsId).toBeNull();
    expect(result.current.state.lastTxHash).toBeNull();
    expect(result.current.state.lastTxHashes).toEqual([]);
    expect(result.current.state.lastPlan).toBeNull();
    expect(result.current.state.lastError).toBeNull();

    await act(async () => {
      resolveSecond();
      await secondRun;
    });

    expect(onFirstError).not.toHaveBeenCalled();
    expect(onSecondError).not.toHaveBeenCalled();
    expect(result.current.state.pending).toBe(false);
  });
});
