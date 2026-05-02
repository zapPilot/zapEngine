import { ActivityTracker } from './common/interceptors';
import { AlphaEtlHttpService } from './common/services';
import { ConfigService } from './config/config.service';
import { AppEnv, loadEnv } from './config/env';
import { DatabaseService } from './database/database.service';
import { UserValidationService } from './database/user-validation.service';
import { JobProcessorService } from './modules/jobs/job-processor.service';
import { JobQueueService } from './modules/jobs/job-queue.service';
import { DailySuggestionProcessor } from './modules/jobs/processors/daily-suggestion.processor';
import { WeeklyReportProcessor } from './modules/jobs/processors/weekly-report.processor';
import { AdminNotificationService } from './modules/notifications/admin-notification.service';
import { AnalyticsClientService } from './modules/notifications/analytics-client.service';
import { ChartService } from './modules/notifications/chart.service';
import { EmailService } from './modules/notifications/email.service';
import { SupabaseUserService } from './modules/notifications/supabase-user.service';
import { TelegramService } from './modules/notifications/telegram.service';
import { TelegramTokenService } from './modules/notifications/telegram-token.service';
import { TemplateService } from './modules/notifications/template.service';
import { UsersService } from './users/users.service';

export interface AppServices {
  env: AppEnv;
  configService: ConfigService;
  databaseService: DatabaseService;
  userValidationService: UserValidationService;
  alphaEtlHttpService: AlphaEtlHttpService;
  telegramTokenService: TelegramTokenService;
  telegramService: TelegramService;
  usersService: UsersService;
  analyticsClientService: AnalyticsClientService;
  chartService: ChartService;
  templateService: TemplateService;
  emailService: EmailService;
  adminNotificationService: AdminNotificationService;
  supabaseUserService: SupabaseUserService;
  jobQueueService: JobQueueService;
  jobProcessorService: JobProcessorService;
  weeklyReportProcessor: WeeklyReportProcessor;
  dailySuggestionProcessor: DailySuggestionProcessor;
  activityTracker: ActivityTracker;
}

export function createContainer(
  rawEnv: NodeJS.ProcessEnv = process.env,
): AppServices {
  const env = loadEnv(rawEnv);
  const configService = new ConfigService(env);
  const databaseService = new DatabaseService(configService);
  const userValidationService = new UserValidationService(databaseService);
  const alphaEtlHttpService = new AlphaEtlHttpService(configService);
  const telegramTokenService = new TelegramTokenService(databaseService);
  const telegramService = new TelegramService(
    configService,
    databaseService,
    telegramTokenService,
  );
  const usersService = new UsersService(
    databaseService,
    userValidationService,
    alphaEtlHttpService,
    telegramService,
    telegramTokenService,
  );
  const analyticsClientService = new AnalyticsClientService(configService);
  const chartService = new ChartService();
  const templateService = new TemplateService();
  const emailService = new EmailService(configService);
  const adminNotificationService = new AdminNotificationService(
    emailService,
    configService,
  );
  const supabaseUserService = new SupabaseUserService(
    databaseService,
    analyticsClientService,
  );
  const jobQueueService = new JobQueueService();
  const jobProcessorService = new JobProcessorService(
    jobQueueService,
    adminNotificationService,
  );
  const weeklyReportProcessor = new WeeklyReportProcessor(
    jobQueueService,
    emailService,
    chartService,
    templateService,
    analyticsClientService,
    supabaseUserService,
  );
  const dailySuggestionProcessor = new DailySuggestionProcessor(
    jobQueueService,
    analyticsClientService,
    telegramService,
  );
  const activityTracker = new ActivityTracker(databaseService);

  jobProcessorService.registerProcessor(weeklyReportProcessor);
  jobProcessorService.registerProcessor(dailySuggestionProcessor);

  return {
    env,
    configService,
    databaseService,
    userValidationService,
    alphaEtlHttpService,
    telegramTokenService,
    telegramService,
    usersService,
    analyticsClientService,
    chartService,
    templateService,
    emailService,
    adminNotificationService,
    supabaseUserService,
    jobQueueService,
    jobProcessorService,
    weeklyReportProcessor,
    dailySuggestionProcessor,
    activityTracker,
  };
}

export function startServices(services: AppServices): void {
  services.telegramService.start();
  services.jobProcessorService.start();
}

export async function stopServices(services: AppServices): Promise<void> {
  await services.telegramService.stop();
  services.jobProcessorService.stop();
  services.jobQueueService.stop();
}
