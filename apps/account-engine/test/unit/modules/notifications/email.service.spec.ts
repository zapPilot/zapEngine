import * as nodemailer from 'nodemailer';
import type { Mock } from 'vitest';

import { ServiceLayerException } from '@/common/exceptions';
import { EmailService } from '@/modules/notifications/email.service';
import { createMockConfigService } from '@/test-utils';

vi.mock('nodemailer');

const mockSendMail = vi.fn();
const mockVerify = vi.fn();

(nodemailer.createTransport as Mock).mockReturnValue({
  sendMail: mockSendMail,
  verify: mockVerify,
});

function createService(env: Record<string, string> = {}) {
  const defaults = {
    EMAIL_USER: 'test@example.com',

    EMAIL_APP_PASSWORD: 'secret',
    NOTIFICATIONS_TEST_RECIPIENT: 'qa@example.com',
    ...env,
  };

  return new EmailService(createMockConfigService(defaults));
}

describe('EmailService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (nodemailer.createTransport as Mock).mockReturnValue({
      sendMail: mockSendMail,
      verify: mockVerify,
    });
  });

  describe('constructor', () => {
    it('creates transporter when credentials are present', () => {
      createService();
      expect(nodemailer.createTransport).toHaveBeenCalled();
    });

    it('does not create transporter when credentials are missing', () => {
      (nodemailer.createTransport as Mock).mockClear();
      createService({ EMAIL_USER: '', EMAIL_APP_PASSWORD: '' });
      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    });
  });

  describe('sendEmail', () => {
    it('sends email and returns success result', async () => {
      mockSendMail.mockResolvedValue({ messageId: 'msg-1' });
      const service = createService();

      const result = await service.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        html: '<p>Hi</p>',
      });

      expect(result.success).toBe(true);
      expect(result.metadata?.recipient).toBe('user@example.com');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'user@example.com', subject: 'Test' }),
      );
    });

    it('throws ServiceLayerException when transporter is not configured', async () => {
      (nodemailer.createTransport as Mock).mockClear();
      const service = createService({ EMAIL_USER: '', EMAIL_APP_PASSWORD: '' });

      await expect(
        service.sendEmail({ to: 'a@b.com', subject: 's', html: '' }),
      ).rejects.toThrow(ServiceLayerException);
    });

    it('throws ServiceLayerException on send failure', async () => {
      mockSendMail.mockRejectedValue(new Error('SMTP timeout'));
      const service = createService();

      await expect(
        service.sendEmail({ to: 'a@b.com', subject: 's', html: '' }),
      ).rejects.toThrow(ServiceLayerException);
    });

    it('includes attachments metadata', async () => {
      mockSendMail.mockResolvedValue({});
      const service = createService();

      const result = await service.sendEmail({
        to: 'a@b.com',
        subject: 's',
        html: '',
        attachments: [
          { filename: 'chart.png', content: Buffer.from(''), cid: 'cid-1' },
        ],
        metricsCount: 5,
      });

      expect(result.metadata?.chartGenerated).toBe(true);
      expect(result.metadata?.metricsIncluded).toBe(5);
    });
  });

  describe('validateEmailConfiguration', () => {
    it('returns valid when transporter verifies', async () => {
      mockVerify.mockResolvedValue(true);
      const service = createService();

      const result = await service.validateEmailConfiguration();
      expect(result.valid).toBe(true);
    });

    it('returns invalid when transporter is not configured', async () => {
      (nodemailer.createTransport as Mock).mockClear();
      const service = createService({ EMAIL_USER: '', EMAIL_APP_PASSWORD: '' });

      const result = await service.validateEmailConfiguration();
      expect(result.valid).toBe(false);
    });

    it('returns invalid on verify failure', async () => {
      mockVerify.mockRejectedValue(new Error('auth failed'));
      const service = createService();

      const result = await service.validateEmailConfiguration();
      expect(result.valid).toBe(false);
      expect(result.message).toContain('auth failed');
    });
  });

  describe('generateSubject', () => {
    it('returns default subject when no percentage', () => {
      const service = createService();
      expect(service.generateSubject({})).toContain('Weekly Report');
    });

    it('returns positive subject for positive PnL', () => {
      const service = createService();
      const subject = service.generateSubject({ weeklyPnLPercentage: 5.3 });
      expect(subject).toContain('+5.3%');
    });

    it('returns negative subject for negative PnL', () => {
      const service = createService();
      const subject = service.generateSubject({ weeklyPnLPercentage: -2.1 });
      expect(subject).toContain('-2.1%');
    });

    it('returns default for NaN percentage', () => {
      const service = createService();
      expect(service.generateSubject({ weeklyPnLPercentage: NaN })).toContain(
        'Weekly Report',
      );
    });
  });

  describe('getTestRecipient', () => {
    it('returns configured test recipient', () => {
      const service = createService();
      expect(service.getTestRecipient()).toBe('qa@example.com');
    });

    it('returns falsy when not configured', () => {
      const service = createService({ NOTIFICATIONS_TEST_RECIPIENT: '' });
      expect(service.getTestRecipient()).toBeFalsy();
    });
  });
});
