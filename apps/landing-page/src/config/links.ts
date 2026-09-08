const ACCOUNT_ENGINE_ORIGIN =
  process.env.NODE_ENV === 'development'
    ? 'http://127.0.0.1:3004'
    : 'https://account-engine.fly.dev';

// Centralized external links. The public marketing site intentionally exposes no
// route to the unfinished v2 app; local/direct app development remains separate.
export const LINKS = {
  waitlistApi: `${ACCOUNT_ENGINE_ORIGIN}/waitlist`,
  telegramBot: 'https://t.me/zap_pilot_bot',
  social: { github: 'https://github.com/zapPilot' },
  support: { contactUs: 'mailto:zap-pilot.org@ud.me' },
} as const;
