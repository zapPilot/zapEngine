import { createHmac } from 'node:crypto';

import { BadRequestException } from '../../../../src/common/http';
import { ReportUnsubscribeTokenService } from '../../../../src/modules/notifications/report-unsubscribe-token.service';
import { createMockConfigService } from '../../../test-utils';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const EMAIL = 'user@example.com';
const TEST_REPORT_UNSUBSCRIBE_SECRET = 'test-report-unsubscribe-secret';

function createService(
  overrides: Record<string, unknown> = {},
): ReportUnsubscribeTokenService {
  return new ReportUnsubscribeTokenService(
    createMockConfigService({
      REPORT_UNSUBSCRIBE_SECRET: TEST_REPORT_UNSUBSCRIBE_SECRET,
      REPORT_UNSUBSCRIBE_URL: 'https://app.example.com/unsubscribe',
      ...overrides,
    }),
  );
}

describe('ReportUnsubscribeTokenService', () => {
  it('round-trips a signed identity token', () => {
    const service = createService();

    const result = service.verifyToken(service.createToken(USER_ID, EMAIL));

    expect(result).toEqual({ v: 1, userId: USER_ID, email: EMAIL });
  });

  it('rejects a tampered token', () => {
    const service = createService();
    const token = service.createToken(USER_ID, EMAIL);
    const tampered = `${token.slice(0, -1)}x`;

    expect(() => service.verifyToken(tampered)).toThrow(BadRequestException);
  });

  it('builds the public confirmation URL with only the signed token', () => {
    const service = createService();

    const result = new URL(service.createUnsubscribeUrl(USER_ID, EMAIL));

    expect(result.origin + result.pathname).toBe(
      'https://app.example.com/unsubscribe',
    );
    expect(result.searchParams.get('token')).toBeTruthy();
    expect(result.searchParams.has('email')).toBe(false);
    expect(result.searchParams.has('address')).toBe(false);
  });

  it('refuses to sign without a dedicated secret', () => {
    const service = createService({ REPORT_UNSUBSCRIBE_SECRET: '  ' });

    expect(() => service.createToken(USER_ID, EMAIL)).toThrow(
      'REPORT_UNSUBSCRIBE_SECRET must be configured',
    );
  });

  describe('branch sweep', () => {
    // Each test names the previously-uncovered branch it locks.
    // mutation: not run (offline sandbox — vitest could not be executed here).

    function forgeToken(encodedPayload: string): string {
      // eslint-disable-next-line sonarjs/hardcoded-secret-signatures -- test-only HMAC secret mirroring createService; not a real credential
      const signature = createHmac('sha256', TEST_REPORT_UNSUBSCRIBE_SECRET)
        .update(encodedPayload)
        .digest('base64url');
      return `${encodedPayload}.${signature}`;
    }

    function forgePayloadToken(payload: unknown): string {
      return forgeToken(
        Buffer.from(JSON.stringify(payload)).toString('base64url'),
      );
    }

    it.each([['no-signature-part'], ['payload.'], ['a.b.c'], ['.sig']])(
      'locks the token structure guard for `%s`',
      (token) => {
        // Locks: `!encodedPayload || !suppliedSignature || extra` true outcomes.
        const service = createService();
        expect(() => service.verifyToken(token)).toThrow(BadRequestException);
      },
    );

    it('locks rejecting a signature with the wrong length', () => {
      // Locks: `suppliedBuffer.length !== expectedBuffer.length` true
      // (timingSafeEqual is never reached with mismatched lengths).
      const service = createService();
      const [encoded] = service.createToken(USER_ID, EMAIL).split('.');
      expect(() => service.verifyToken(`${encoded}.c2hvcnQ`)).toThrow(
        BadRequestException,
      );
    });

    it.each([
      [{ v: 2, userId: 'u', email: 'e@x.com' }, 'wrong version'],
      [{ v: 1, userId: 42, email: 'e@x.com' }, 'non-string userId'],
      [{ v: 1, userId: '', email: 'e@x.com' }, 'empty userId'],
      [{ v: 1, userId: 'u', email: 42 }, 'non-string email'],
      [{ v: 1, userId: 'u', email: '' }, 'empty email'],
    ])('locks rejecting a well-signed but invalid payload (%s)', (payload) => {
      // Locks: the parsed-shape guards (each || operand) and the
      // `error instanceof BadRequestException` rethrow path.
      const service = createService();
      expect(() => service.verifyToken(forgePayloadToken(payload))).toThrow(
        BadRequestException,
      );
    });

    it('locks rejecting a well-signed payload that is not JSON', () => {
      // Locks: JSON.parse throw → catch → non-BadRequestException → invalidToken.
      const service = createService();
      const notJson = Buffer.from('not json').toString('base64url');
      expect(() => service.verifyToken(forgeToken(notJson))).toThrow(
        BadRequestException,
      );
    });

    it('locks the default unsubscribe URL when none is configured', () => {
      // Locks: `configuredUrl ?? EMAIL_CONFIG.DEFAULT_REPORT_UNSUBSCRIBE_URL`.
      const service = createService({ REPORT_UNSUBSCRIBE_URL: undefined });
      const url = new URL(service.createUnsubscribeUrl(USER_ID, EMAIL));
      expect(url.origin + url.pathname).toBe(
        'https://app.zap-pilot.org/unsubscribe',
      );
    });

    it('locks rejecting an unset (not just blank) signing secret', () => {
      // Locks: `get<string>('REPORT_UNSUBSCRIBE_SECRET')?.trim()` nullish
      // short-circuit.
      const service = createService({ REPORT_UNSUBSCRIBE_SECRET: undefined });
      expect(() => service.createToken(USER_ID, EMAIL)).toThrow(
        'REPORT_UNSUBSCRIBE_SECRET must be configured',
      );
    });
  });
});
