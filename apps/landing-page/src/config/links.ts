// Centralized configuration for all external and internal links
export const LINKS = {
  // Main application
  app: process.env['NEXT_PUBLIC_APP_URL'] || 'https://app.zap-pilot.org',
  // Telegram bot is not live yet. CTA labels say "(Coming Soon)" so users know.
  // Once the bot ships, replace this handle and drop the "(Coming Soon)" suffix in messages.ts.
  telegramBot: 'https://t.me/zap_pilot_bot',
  // Dedicated backtests page does not exist yet; route to the top-level docs
  // site until `content/docs/strategy/backtests.mdx` is published.
  strategyBacktests: 'https://docs.zap-pilot.org/',

  // Documentation and resources
  documentation: 'https://docs.zap-pilot.org/',
  apiReference: 'https://zappilot.github.io/intent-engine/',
  tutorials: 'https://docs.zap-pilot.org/docs/getting-started',
  whitepaper: 'https://docs.zap-pilot.org/whitepaper',

  // Social media
  social: {
    twitter: 'https://x.com/zappilot',
    discord: 'https://discord.gg/d3vXUtcFCJ',
    github: 'https://github.com/zapPilot',
    medium: 'https://farcaster.xyz/david-chang',
    youtube: 'https://www.youtube.com/watch?v=CnvKz3YbP08',
  },

  // Support and community
  support: {
    contactUs: 'mailto:zap-pilot.org@ud.me',
    bugReport: 'https://github.com/zap-pilot/issues/new',
    featureRequest:
      'https://github.com/zap-pilot/issues/new?template=feature_request.md',
    feedback: 'https://forms.gle/zappilot-feedback',
  },

  // Legal and compliance
  legal: {
    termsOfService: 'https://zap-pilot.org/terms',
    privacyPolicy: 'https://zap-pilot.org/privacy',
    cookiePolicy: 'https://zap-pilot.org/cookies',
    disclaimer: 'https://zap-pilot.org/disclaimer',
  },

  // Development and technical
  development: {
    github: 'https://github.com/zapPilot',
  },

  // Marketing and press
  marketing: {
    brandKit: '/brand-guide.md',
    pressKit: 'https://press.zap-pilot.org',
    partnerships: 'mailto:zap-pilot.org@ud.me',
    media: 'mailto:zap-pilot.org@ud.me',
  },

  // Newsletter and subscriptions
  newsletter: {
    subscribe: 'https://newsletter.zap-pilot.org/subscribe',
    unsubscribe: 'https://newsletter.zap-pilot.org/unsubscribe',
    archive: 'https://newsletter.zap-pilot.org/archive',
  },

  // Analytics and tracking (for internal use)
  analytics: {
    mixpanel: process.env['NEXT_PUBLIC_MIXPANEL_TOKEN'],
    googleAnalytics: process.env['NEXT_PUBLIC_GA_ID'],
    hotjar: process.env['NEXT_PUBLIC_HOTJAR_ID'],
  },
} as const;

// Helper functions for link handling
export const openExternalLink = (url: string) => {
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
};

// Navigation links for internal site sections
export const NAVIGATION = {
  internal: [
    { href: '#features', label: 'Features' },
    { href: '#how-it-works', label: 'How It Works' },
    { href: '/docs', label: 'Docs' },
  ],
  footer: {
    product: [
      { href: '#features', label: 'Features' },
      { href: '#how-it-works', label: 'How It Works' },
      { href: '/docs', label: 'Docs' },
      { href: LINKS.telegramBot, label: 'Telegram Bot', external: true },
      { href: LINKS.app, label: 'Launch App', external: true },
    ],
    resources: [
      { href: LINKS.documentation, label: 'Documentation', external: true },
      {
        href: LINKS.strategyBacktests,
        label: 'Strategy Backtests',
        external: true,
      },
      { href: LINKS.apiReference, label: 'API Reference', external: true },
      { href: LINKS.tutorials, label: 'Tutorials', external: true },
    ],
    community: [
      { href: LINKS.social.discord, label: 'Discord', external: true },
      { href: LINKS.social.twitter, label: 'Twitter', external: true },
      { href: LINKS.social.github, label: 'GitHub', external: true },
      { href: LINKS.newsletter.subscribe, label: 'Newsletter', external: true },
    ],
  },
} as const;
