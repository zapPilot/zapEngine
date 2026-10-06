import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { CapabilityStatusTable } from '../CapabilityStatusTable';
import {
  CAPABILITIES,
  CAPABILITY_STATUSES,
  STATUS_DEFINITION,
  STATUS_LABEL,
  type CapabilityId,
} from '@/config/runtime';

describe('CapabilityStatusTable', () => {
  it('lists every capability once with its recorded status', () => {
    const { container } = render(<CapabilityStatusTable />);
    const ids = Object.keys(CAPABILITIES) as CapabilityId[];
    expect(container.querySelectorAll('tbody tr')).toHaveLength(ids.length);
    for (const id of ids) {
      const badge = container.querySelector(`[data-capability="${id}"]`);
      expect(badge).toHaveTextContent(STATUS_LABEL[CAPABILITIES[id].status]);
      expect(screen.getByText(CAPABILITIES[id].detail)).toBeInTheDocument();
    }
  });

  it('groups rows by status in the canonical order', () => {
    const { container } = render(<CapabilityStatusTable />);
    const statuses = Array.from(
      container.querySelectorAll('tbody [data-status]'),
    ).map((badge) => badge.getAttribute('data-status'));
    const order = statuses.map((status) =>
      CAPABILITY_STATUSES.indexOf(status as (typeof CAPABILITY_STATUSES)[0]),
    );
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it('defines each status', () => {
    render(<CapabilityStatusTable />);
    for (const status of CAPABILITY_STATUSES) {
      expect(screen.getByText(STATUS_DEFINITION[status])).toBeInTheDocument();
    }
  });
});
