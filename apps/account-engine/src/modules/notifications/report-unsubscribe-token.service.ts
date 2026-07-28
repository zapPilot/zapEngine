import { createHmac, timingSafeEqual } from 'node:crypto';

import { EMAIL_CONFIG } from '../../common/constants';
import { BadRequestException } from '../../common/http';
import { ConfigService } from '../../config/config.service';

interface ReportUnsubscribePayload {
  v: 1;
  userId: string;
  email: string;
}

export class ReportUnsubscribeTokenService {
  constructor(private readonly configService: ConfigService) {}

  createToken(userId: string, email: string): string {
    const payload: ReportUnsubscribePayload = {
      v: 1,
      userId,
      email,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      'base64url',
    );
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  createUnsubscribeUrl(userId: string, email: string): string {
    const configuredUrl = this.configService.get<string>(
      'REPORT_UNSUBSCRIBE_URL',
      EMAIL_CONFIG.DEFAULT_REPORT_UNSUBSCRIBE_URL,
    );
    const baseUrl =
      configuredUrl ?? EMAIL_CONFIG.DEFAULT_REPORT_UNSUBSCRIBE_URL;
    const url = new URL(baseUrl);
    url.searchParams.set('token', this.createToken(userId, email));
    return url.toString();
  }

  verifyToken(token: string): ReportUnsubscribePayload {
    const [encodedPayload, suppliedSignature, extra] = token.split('.');
    if (!encodedPayload || !suppliedSignature || extra) {
      throw this.invalidToken();
    }

    const expectedSignature = this.sign(encodedPayload);
    const suppliedBuffer = Buffer.from(suppliedSignature);
    const expectedBuffer = Buffer.from(expectedSignature);
    if (
      suppliedBuffer.length !== expectedBuffer.length ||
      !timingSafeEqual(suppliedBuffer, expectedBuffer)
    ) {
      throw this.invalidToken();
    }

    try {
      const parsed = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf8'),
      ) as Partial<ReportUnsubscribePayload>;
      if (
        parsed.v !== 1 ||
        typeof parsed.userId !== 'string' ||
        parsed.userId.length === 0 ||
        typeof parsed.email !== 'string' ||
        parsed.email.length === 0
      ) {
        throw this.invalidToken();
      }

      return {
        v: 1,
        userId: parsed.userId,
        email: parsed.email,
      };
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw this.invalidToken();
    }
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.getSigningSecret())
      .update(encodedPayload)
      .digest('base64url');
  }

  private getSigningSecret(): string {
    const configuredSecret = this.configService.get<string>(
      'REPORT_UNSUBSCRIBE_SECRET',
    );
    const fallbackSecret = this.configService.get<string>(
      'SUPABASE_SERVICE_ROLE_KEY',
    );
    const secret = configuredSecret?.trim() || fallbackSecret?.trim();

    if (!secret) {
      throw new Error(
        'REPORT_UNSUBSCRIBE_SECRET or SUPABASE_SERVICE_ROLE_KEY must be configured',
      );
    }

    return secret;
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException('Invalid unsubscribe token');
  }
}
