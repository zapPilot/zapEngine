import {
  type Job,
  JobStatus,
  JobType,
} from '@/modules/jobs/interfaces/job.interface';
import { AdminNotificationService } from '@/modules/notifications/admin-notification.service';
import { EmailService } from '@/modules/notifications/email.service';
import { createMockConfigService } from '@/test-utils';

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

      const html = emailService.sendEmail.mock.calls[0]?.[0].html as string;
      expect(html).toContain('u-42');
    });

    it('handles missing errorMessage gracefully', async () => {
      const { service, emailService } = createMocks();

      await service.notifyJobFailure(
        createFailedJob({ errorMessage: undefined }),
      );

      const html = emailService.sendEmail.mock.calls[0]?.[0].html as string;
      expect(html).toContain('Unknown error');
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
