// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OperatorAudit } from './OperatorAudit.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function auditResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { 'content-type': 'application/json' },
  });
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    actions: [{ retry: 'video' }],
    actor: 'operator',
    correlation: {},
    decision: 'Restarted the stuck render',
    evidence: { machines: 0 },
    fingerprint: 'fly:machine/app',
    id: '11111111-1111-4111-8111-111111111111',
    state: 'verified',
    updated_at: '2026-09-10T00:00:00.000Z',
    verification: { policyVersion: 'ops-verification-v1' },
    ...overrides,
  };
}

describe('OperatorAudit', () => {
  it('renders recorded observations with their evidence', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(auditResponse([row()])));

    render(<OperatorAudit />);

    expect(await screen.findByText('fly:machine/app')).toBeVisible();
    expect(screen.getByText(/verified · operator/)).toBeVisible();
    expect(screen.getByText('Restarted the stuck render')).toBeVisible();

    const evidence = screen.getByText('Evidence').closest('details');
    expect(evidence).not.toBeNull();
    expect(within(evidence!).getByText(/"retry": "video"/)).not.toBeNull();
  });

  it('tones an unverified state as neutral rather than successful', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(auditResponse([row({ state: 'blocked' })])),
    );

    render(<OperatorAudit />);

    expect(await screen.findByText('fly:machine/app')).toBeVisible();
    expect(screen.getByText(/blocked · operator/)).toBeVisible();
  });

  it('says the loop has recorded nothing yet', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(auditResponse([])));

    render(<OperatorAudit />);

    expect(await screen.findByText('尚無維運紀錄')).toBeVisible();
  });

  it('names the outage instead of rendering an empty timeline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));

    render(<OperatorAudit />);

    expect(
      await screen.findByText('稽核資料暫時無法取得，修復與驗證狀態未知。'),
    ).toBeVisible();
  });

  it('treats an unparseable payload as an outage', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(auditResponse([{ nope: true }])),
    );

    render(<OperatorAudit />);

    expect(
      await screen.findByText('稽核資料暫時無法取得，修復與驗證狀態未知。'),
    ).toBeVisible();
  });

  it('refetches when the refresh marker changes', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(auditResponse([]))
      .mockResolvedValueOnce(auditResponse([row()]));
    vi.stubGlobal('fetch', fetchMock);

    const { rerender } = render(<OperatorAudit refreshedAt="t1" />);
    expect(await screen.findByText('尚無維運紀錄')).toBeVisible();

    rerender(<OperatorAudit refreshedAt="t2" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('fly:machine/app')).toBeVisible();
  });
});
