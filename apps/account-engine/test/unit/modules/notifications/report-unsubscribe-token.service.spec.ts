import { BadRequestException } from '../../../../src/common/http';
import { ReportUnsubscribeTokenService } from '../../../../src/modules/notifications/report-unsubscribe-token.service';
import { createMockConfigService } from '../../../test-utils';

const USER_ID = '123e4567-e89b-12d3-a456-426614174000';
const EMAIL = 'user@example.com';

function createService(
  overrides: Record<string, unknown> = {},
): ReportUnsubscribeTokenService {
  return new ReportUnsubscribeTokenService(
    createMockConfigService({
      REPORT_UNSUBSCRIBE_SECRET: 'test-report-unsubscribe-secret',
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

  it('falls back to the service-role key when a dedicated secret is absent', () => {
    const service = createService({
      REPORT_UNSUBSCRIBE_SECRET: '',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-fallback',
    });

    expect(() => service.createToken(USER_ID, EMAIL)).not.toThrow();
  });
});
