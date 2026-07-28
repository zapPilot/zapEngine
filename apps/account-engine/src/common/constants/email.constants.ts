/**
 * Email service configuration constants
 */
export const EMAIL_CONFIG = {
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: 465,
  SMTP_SECURE: true,
  MIN_WEEKLY_REPORT_BALANCE_USD: 10,
  DEFAULT_REPORT_UNSUBSCRIBE_URL: 'https://app.zap-pilot.org/unsubscribe',
} as const;
