import {
  type Job,
  JobStatus,
  JobType,
} from '../../../../src/modules/jobs/interfaces/job.interface';
import { AdminNotificationService } from '../../../../src/modules/notifications/admin-notification.service';
import { EmailService } from '../../../../src/modules/notifications/email.service';
import { createMockConfigService } from '../../../test-utils';

function createFailedJob(overrides: Partial<Job> = {}): Job {
  return {
    id: 'job-1',
    type: JobType.WEEKLY_REPORT_SINGLE,
    status: JobStatus.FAILED,
    payload: { userId: 'user-1' },
    priority: 0,
    maxRetries: 3,
    retryCount: 3,
    retryDelaySeconds: 60,
    errorMessage: 'DB timeout',
    scheduledAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMocks(env: Record<string, string> = {}) {
  const emailService = {
    sendEmail: vi.fn().mockResolvedValue({ success: true }),
  };

  const defaults = {
    ADMIN_NOTIFICATIONS_ENABLED: 'true',
    EMAIL_USER: 'admin@example.com',
    ...env,
  };

  const configService = createMockConfigService(defaults);

  const service = new AdminNotificationService(
    emailService as unknown as EmailService,
    configService,
  );

  return { service, emailService, configService };
}

function getSentHtml(emailService: ReturnType<typeof createMocks>['emailService']) {
  return emailService.sendEmail.mock.calls[0]?.[0].html as string;
}

describe('AdminNotificationService', () => {
  describe('notifyJobFailure', () => {
    it('sends failure email to admin', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(createFailedJob());

      expect(emailService.sendEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'admin@example.com',
          subject: expect.stringContaining('Job Failure'),
        }),
      );
    });

    it('sends to multiple admin emails', async () => {
      const { service, emailService } = createMocks({
        EMAIL_USER: 'admin1@ex.com,admin2@ex.com',
      });

      await service.notifyJobFailure(createFailedJob());

      expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
    });

    it('ignores blank entries while trimming admin email recipients', async () => {
      const { service, emailService } = createMocks({
        EMAIL_USER: ' admin1@ex.com, ,admin2@ex.com, ',
      });

      await service.notifyJobFailure(createFailedJob());

      expect(emailService.sendEmail).toHaveBeenCalledTimes(2);
      expect(emailService.sendEmail).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ to: 'admin1@ex.com' }),
      );
      expect(emailService.sendEmail).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ to: 'admin2@ex.com' }),
      );
    });

    it('does not send when notifications are disabled', async () => {
      const { service, emailService } = createMocks({
        ADMIN_NOTIFICATIONS_ENABLED: 'false',
      });

      await service.notifyJobFailure(createFailedJob());

      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('does not send when no admin email configured', async () => {
      const { service, emailService } = createMocks({ EMAIL_USER: '' });

      await service.notifyJobFailure(createFailedJob());

      expect(emailService.sendEmail).not.toHaveBeenCalled();
    });

    it('does not throw when email send fails', async () => {
      const { service, emailService } = createMocks();
      emailService.sendEmail.mockRejectedValue(new Error('SMTP down'));

      await expect(
        service.notifyJobFailure(createFailedJob()),
      ).resolves.toBeUndefined();
    });

    it('extracts userId from payload', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ payload: { userId: 'u-42' } }),
      );

      expect(getSentHtml(emailService)).toContain('u-42');
    });

    it('falls back to legacy user_id payload field', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ payload: { user_id: 'u-legacy' } }),
      );

      expect(getSentHtml(emailService)).toContain('u-legacy');
    });

    it('falls back to id payload field when user identifiers are absent', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ payload: { id: 'u-from-id' } }),
      );

      expect(getSentHtml(emailService)).toContain('u-from-id');
    });

    it('falls back to user payload field when other identifiers are absent', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ payload: { user: 'u-from-user' } }),
      );

      expect(getSentHtml(emailService)).toContain('u-from-user');
    });

    it('renders N/A when payload user identifier is not a string', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ payload: { userId: 12345 } }),
      );

      const html = getSentHtml(emailService);
      expect(html).toContain('N/A');
      expect(html).not.toContain('12345</td>');
    });

    it('handles missing errorMessage gracefully', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ errorMessage: undefined }),
      );

      expect(getSentHtml(emailService)).toContain('Unknown error');
    });

    it('handles job with undefined payload (extractUserId returns null)', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({
          payload: undefined as unknown as Record<string, unknown>,
        }),
      );

      expect(emailService.sendEmail).toHaveBeenCalled();
    });

    it('sends notification when ADMIN_NOTIFICATIONS_ENABLED is not set (defaults to enabled)', async () => {
      const { service, emailService } = createMocks({
        ADMIN_NOTIFICATIONS_ENABLED: '', // empty string → getNotificationsEnabled returns true
      });

      await service.notifyJobFailure(createFailedJob());

      expect(emailService.sendEmail).toHaveBeenCalled();
    });
  });
});
