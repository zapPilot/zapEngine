import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ChartZoom } from '../ChartZoom.client';

function renderZoom() {
  return render(
    <ChartZoom label="Strategy NAV">
      <p>expanded chart body</p>
    </ChartZoom>,
  );
}

function trigger(): HTMLElement {
  return screen.getByRole('button', { name: 'Expand Strategy NAV chart' });
}

function closeButton(): HTMLElement {
  return screen.getByRole('button', { name: 'Close expanded chart' });
}

function dialog(): HTMLElement {
  return screen.getByRole('dialog', {
    name: 'Strategy NAV — expanded chart',
  });
}

describe('ChartZoom', () => {
  it('names the chart it expands and announces the dialog it opens', () => {
    renderZoom();

    expect(trigger()).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.queryByText('expanded chart body')).toBeNull();
  });

  it('shows the wrapped chart in a modal dialog when expanded', () => {
    renderZoom();

    fireEvent.click(trigger());

    expect(dialog()).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('expanded chart body')).toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
  });

  it('moves focus into the dialog and returns it to the trigger on close', () => {
    renderZoom();

    fireEvent.click(trigger());
    expect(closeButton()).toHaveFocus();

    fireEvent.click(closeButton());
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(trigger()).toHaveFocus();
  });

  it('closes on Escape', () => {
    renderZoom();
    fireEvent.click(trigger());

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('ignores keys that are not Escape', () => {
    renderZoom();
    fireEvent.click(trigger());

    fireEvent.keyDown(document, { key: 'a' });

    expect(screen.queryByRole('dialog')).not.toBeNull();
  });

  it('stops listening for Escape once closed', () => {
    renderZoom();
    fireEvent.click(trigger());
    fireEvent.keyDown(document, { key: 'Escape' });

    // A second Escape with nothing open must not throw or reopen anything.
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes on a backdrop click but not on a click inside the dialog', () => {
    renderZoom();
    fireEvent.click(trigger());

    fireEvent.click(screen.getByText('expanded chart body'));
    expect(screen.queryByRole('dialog')).not.toBeNull();

    fireEvent.click(dialog().parentElement!);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('locks page scroll while expanded and restores the previous value', () => {
    document.body.style.overflow = 'auto';
    renderZoom();

    fireEvent.click(trigger());
    expect(document.body.style.overflow).toBe('hidden');

    fireEvent.click(closeButton());
    expect(document.body.style.overflow).toBe('auto');
  });

  it('restores page scroll when unmounted while still expanded', () => {
    document.body.style.overflow = '';
    const { unmount } = renderZoom();
    fireEvent.click(trigger());

    unmount();

    expect(document.body.style.overflow).toBe('');
  });

  it('scopes the overlay so the landing chart styles still apply', () => {
    renderZoom();

    fireEvent.click(trigger());

    // Every chart rule in landing.css is scoped under .shell-root, and the
    // overlay is portalled outside it.
    expect(dialog().parentElement).toHaveClass('shell-root');
  });
});
