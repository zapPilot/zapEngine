import '@testing-library/jest-dom';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { RuntimeTrace } from '@/components/landing-v2/RuntimeTrace';
import { MESSAGES } from '@/config/messages';
import {
  CAPABILITIES,
  STATUS_LABEL,
  capabilityIds,
} from '@zapengine/zap-pilot-story/facts';

describe('RuntimeTrace', () => {
  it('renders one row per stage with that stage’s status badge', () => {
    render(<RuntimeTrace />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(MESSAGES.trace.rows.length);

    MESSAGES.trace.rows.forEach((row, index) => {
      const item = within(rows[index]!);
      expect(item.getByText(row.stage)).toBeInTheDocument();
      const badges = rows[index]!.querySelectorAll(
        `[data-capability="${capabilityIds(row.capability).join(' ')}"]`,
      );
      expect(badges.length).toBeGreaterThan(0);
      const status = CAPABILITIES[capabilityIds(row.capability)[0]!].status;
      expect(badges[badges.length - 1]).toHaveTextContent(STATUS_LABEL[status]);
    });
  });

  it('replays the recorded exit without any dollar amount', () => {
    const { container } = render(<RuntimeTrace />);
    expect(container.textContent).not.toMatch(/\$\d/);
    expect(screen.getByText(MESSAGES.trace.replay)).toBeInTheDocument();
    expect(screen.getByText(MESSAGES.trace.footnote)).toBeInTheDocument();
  });

  it('links the verify stage to the on-chain calculator', () => {
    render(<RuntimeTrace />);
    const verify = MESSAGES.trace.rows.find((row) => 'href' in row)!;
    expect(
      screen.getByRole('link', { name: new RegExp(verify.text) }),
    ).toHaveAttribute('href', 'href' in verify ? verify.href : '');
  });
});
