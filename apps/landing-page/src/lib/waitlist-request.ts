import { LINKS } from '@/config/links';
import type { CtaFailureReason } from './analytics/events';
export function postWaitlist(payload: Record<string, unknown>) {
  return fetch(LINKS.waitlistApi, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify(payload),
  });
}
export function waitlistFailure(status: number): CtaFailureReason {
  return status === 429
    ? 'rate_limited'
    : status >= 500
      ? 'server_error'
      : 'request_rejected';
}
