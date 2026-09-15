// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CopyableId } from './CopyableId.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
});

function stubClipboard(writeText: (value: string) => Promise<void>) {
  Object.defineProperty(window.navigator, 'clipboard', {
    configurable: true,
    value: { writeText: vi.fn(writeText) },
  });
  return window.navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
}

describe('CopyableId', () => {
  it('shows the full value so it can be pasted into a query', () => {
    render(<CopyableId label="episode id" value="ep-123" />);

    expect(screen.getByRole('button', { name: 'Copy episode id' })).toHaveTextContent(
      'ep-123',
    );
  });

  it('copies on click and confirms, then reverts after the timeout', async () => {
    const writeText = stubClipboard(async () => undefined);
    render(<CopyableId label="episode id" value="ep-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy episode id' }));

    expect(writeText).toHaveBeenCalledWith('ep-123');
    expect(screen.getByRole('button', { name: 'Copy episode id' })).toHaveTextContent(
      'Copied',
    );

    await act(async () => {
      vi.advanceTimersByTime(1200);
    });
    expect(screen.getByRole('button', { name: 'Copy episode id' })).toHaveTextContent(
      'ep-123',
    );
  });

  it('still confirms when the clipboard write rejects', () => {
    stubClipboard(async () => {
      throw new Error('denied');
    });
    render(<CopyableId label="visual hash" value="abc" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy visual hash' }));

    expect(screen.getByRole('button', { name: 'Copy visual hash' })).toHaveTextContent(
      'Copied',
    );
  });

  it('copies nothing but still confirms when the clipboard API is absent', () => {
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: undefined,
    });
    render(<CopyableId label="episode id" value="ep-123" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy episode id' }));

    expect(screen.getByRole('button', { name: 'Copy episode id' })).toHaveTextContent(
      'Copied',
    );
  });

  it('merges an extra class onto the button', () => {
    const { container } = render(
      <CopyableId className="extra" label="episode id" value="ep-123" />,
    );

    expect(container.querySelector('button.copyable-id.extra')).not.toBeNull();
  });
});
