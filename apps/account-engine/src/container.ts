import { ActivityTracker } from './common/interceptors';
import { Logger } from './common/logger';
import { AlphaEtlHttpService } from './common/services';
import { ConfigService } from './config/config.service';
import { AppEnv, loadEnv } from './config/env';
import { DatabaseService } from './database/database.service';
import { UserValidationService } from './database/user-validation.service';
import { JobProcessorService } from './modules/jobs/job-processor.service';
import { JobQueueService } from './modules/jobs/job-queue.service';
import { StrategyChangeProcessor } from './modules/jobs/processors/strategy-change.processor';
import { WeeklyReportProcessor } from './modules/jobs/processors/weekly-report.processor';
import { AdminNotificationService } from './modules/notifications/admin-notification.service';
import { AnalyticsClientService } from './modules/notifications/analytics-client/client';
import { ChartService } from './modules/notifications/chart.service';
import { EmailService } from './modules/notifications/email.service';
import { ReportUnsubscribeTokenService } from './modules/notifications/report-unsubscribe-token.service';
import { StrategyChangeStateService } from './modules/notifications/strategy-change-state.service';
import { SupabaseUserService } from './modules/notifications/supabase-user.service';
import { TelegramService } from './modules/notifications/telegram.service';
import { TelegramTokenService } from './modules/notifications/telegram-token.service';
import { TemplateService } from './modules/notifications/template.service';
import { TrackRecordCurveService } from './modules/notifications/track-record/client';
import {
  createDepositPublicClients,
  createPlanOrchestrationModule,
  decodeProtocolMethod,
  parseDepositDefaultSplit,
  type PlanOrchestrationService,
  planSimulationConfigFromEnv,
  resolveProtocolContractName,
} from './modules/plan-orchestration';
import { createAccountDeletionChallengeService } from './services/account-deletion-challenge.service';
import {
  createPrivyWalletExecutionService,
  type PrivyWalletExecutionService,
} from './services/privy-wallet-execution.service';
import { createTenderlySimulationService } from './services/tenderly-simulation.service';
import { createWalletBindingChallengeService } from './services/wallet-binding-challenge.service';
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
  reportUnsubscribeTokenService: ReportUnsubscribeTokenService;
  adminNotificationService: AdminNotificationService;
  supabaseUserService: SupabaseUserService;
  jobQueueService: JobQueueService;
  jobProcessorService: JobProcessorService;
  weeklyReportProcessor: WeeklyReportProcessor;
  trackRecordCurveService: TrackRecordCurveService;
  strategyChangeStateService: StrategyChangeStateService;
  strategyChangeProcessor: StrategyChangeProcessor;
  activityTracker: ActivityTracker;
  planOrchestrationService: PlanOrchestrationService;
  privyWalletExecutionService: PrivyWalletExecutionService;
}

export function createContainer(
  rawEnv: NodeJS.ProcessEnv = process.env,
): AppServices {
  const env = loadEnv(rawEnv);
  const configService = new ConfigService(env);
  const databaseService = new DatabaseService(configService);
  const userValidationService = new UserValidationService(databaseService);
  const alphaEtlHttpService = new AlphaEtlHttpService(configService);
  const reportUnsubscribeTokenService = new ReportUnsubscribeTokenService(
    configService,
  );
  const telegramTokenService = new TelegramTokenService(databaseService);
  const telegramService = new TelegramService(
    configService,
    databaseService,
    telegramTokenService,
  );
  const walletBindingChallengeService = createWalletBindingChallengeService();
  const accountDeletionChallengeService =
    createAccountDeletionChallengeService();
  const usersService = new UsersService(
    databaseService,
    userValidationService,
    alphaEtlHttpService,
    telegramService,
    telegramTokenService,
    walletBindingChallengeService,
    accountDeletionChallengeService,
    reportUnsubscribeTokenService,
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
    reportUnsubscribeTokenService,
  );
  const trackRecordCurveService = new TrackRecordCurveService(configService);
  const strategyChangeStateService = new StrategyChangeStateService(
    databaseService,
  );
  const strategyChangeProcessor = new StrategyChangeProcessor(
    jobQueueService,
    trackRecordCurveService,
    strategyChangeStateService,
    telegramService,
  );
  const activityTracker = new ActivityTracker(databaseService);
  const planSimulation = planSimulationConfigFromEnv({
    accountSlug: env.TENDERLY_ACCOUNT_SLUG,
    projectSlug: env.TENDERLY_PROJECT_SLUG,
    accessToken: env.TENDERLY_ACCESS_TOKEN,
    required: env.PLAN_SIMULATION_REQUIRED,
    mode: env.PLAN_SIMULATION_MODE,
  });
  const tenderlySimulationService = createTenderlySimulationService({
    ...(env.TENDERLY_ACCOUNT_SLUG
      ? { accountSlug: env.TENDERLY_ACCOUNT_SLUG }
      : {}),
    ...(env.TENDERLY_PROJECT_SLUG
      ? { projectSlug: env.TENDERLY_PROJECT_SLUG }
      : {}),
    ...(env.TENDERLY_ACCESS_TOKEN
      ? { accessToken: env.TENDERLY_ACCESS_TOKEN }
      : {}),
    // The routing ABIs live in plan-orchestration, the only module allowed to
    // know protocols. Sharing one instance is load-bearing too: the review rail
    // and the execution-preview rail below must decode the same method names,
    // or their warnings — and with them the risk hash the client compares
    // before signing — would differ.
    decodeProtocolMethod,
    resolveContractName: resolveProtocolContractName,
  });
  if (env.PLAN_SIMULATION_MODE === 'off' && !planSimulation.tenderly) {
    new Logger('plan-orchestration').warn(
      'Plan simulation disabled via PLAN_SIMULATION_MODE=off — deposit plans are not Tenderly-simulated',
    );
  }
  const planOrchestrationService = createPlanOrchestrationModule({
    lifi: {
      integrator: env.LIFI_INTEGRATOR,
      ...(env.LIFI_API_KEY ? { apiKey: env.LIFI_API_KEY } : {}),
    },
    publicClients: createDepositPublicClients(configService),
    ...(env.DEPOSIT_DEFAULT_SPLIT
      ? {
          deposit: {
            defaultSplit: parseDepositDefaultSplit(env.DEPOSIT_DEFAULT_SPLIT),
          },
        }
      : {}),
    ...(env.HYPERLIQUID_NETWORK
      ? { hyperliquid: { network: env.HYPERLIQUID_NETWORK } }
      : {}),
    simulation: {
      ...planSimulation,
      ...(planSimulation.tenderly
        ? { reviewService: tenderlySimulationService }
        : {}),
    },
  });
  const privyWalletExecutionService = createPrivyWalletExecutionService({
    ...(env.PRIVY_APP_ID ? { appId: env.PRIVY_APP_ID } : {}),
    ...(env.PRIVY_APP_SECRET ? { appSecret: env.PRIVY_APP_SECRET } : {}),
    ...(env.TENDERLY_ACCOUNT_SLUG
      ? { tenderlyAccountSlug: env.TENDERLY_ACCOUNT_SLUG }
      : {}),
    ...(env.TENDERLY_PROJECT_SLUG
      ? { tenderlyProjectSlug: env.TENDERLY_PROJECT_SLUG }
      : {}),
    ...(env.TENDERLY_ACCESS_TOKEN
      ? { tenderlyAccessToken: env.TENDERLY_ACCESS_TOKEN }
      : {}),
    tenderlySimulationService,
  });

  jobProcessorService.registerProcessor(weeklyReportProcessor);
  jobProcessorService.registerProcessor(strategyChangeProcessor);

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
    reportUnsubscribeTokenService,
    adminNotificationService,
    supabaseUserService,
    jobQueueService,
    jobProcessorService,
    weeklyReportProcessor,
    trackRecordCurveService,
    strategyChangeStateService,
    strategyChangeProcessor,
    activityTracker,
    planOrchestrationService,
    privyWalletExecutionService,
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
