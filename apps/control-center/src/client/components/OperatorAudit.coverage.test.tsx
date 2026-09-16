// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
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

describe('OperatorAudit unmount race', () => {
  it('ignores a late failure after unmount instead of flagging an outage', async () => {
    let rejectFetch!: (reason: unknown) => void;
    const pending = new Promise<Response>((_resolve, reject) => {
      rejectFetch = reject;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

    const { unmount } = render(<OperatorAudit />);
    unmount();
    rejectFetch(new Error('late outage'));

    // Let the rejection settle; nothing should render after unmount.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText('稽核資料暫時無法取得')).toBeNull();
  });

  it('ignores a late success after unmount', async () => {
    let resolveFetch!: (value: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(pending));

    const { unmount } = render(<OperatorAudit />);
    unmount();
    resolveFetch(auditResponse([]));

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.body.textContent ?? '').not.toContain('尚無維運紀錄');
  });
});
