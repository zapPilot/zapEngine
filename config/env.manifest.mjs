/**
 * Canonical environment inventory.
 *
 * Human-maintained files and deployment stores use these unprefixed names.
 * Public bundler prefixes are projections only; server and host values retain
 * their canonical names.
 */

const client = (targets, projections, options = {}) => ({
  kind: 'client',
  targets,
  projections,
  requiredFor: options.requiredFor ?? [],
  sensitive: options.sensitive ?? false,
  environments: options.environments ?? ['dev', 'prod'],
  documented: options.documented ?? true,
});

const server = (targets, options = {}) => ({
  kind: 'server',
  targets,
  projections: {},
  requiredFor: options.requiredFor ?? [],
  sensitive: options.sensitive ?? false,
  environments: options.environments ?? ['dev', 'prod'],
  documented: options.documented ?? true,
});

const host = (targets, options = {}) => ({
  kind: 'host',
  targets,
  projections: {},
  requiredFor: [],
  sensitive: options.sensitive ?? false,
  environments: [],
  documented: options.documented ?? true,
});

const WEB_TARGETS = ['web', 'desktop'];
const APP_TARGETS = ['web', 'expo', 'desktop'];

export const ENV_MANIFEST = {
  ACCOUNT_API_URL: client(APP_TARGETS, {
    vite: 'VITE_ACCOUNT_API_URL',
    expo: 'EXPO_PUBLIC_ACCOUNT_API_URL',
  }),
  ANALYTICS_ENGINE_URL: client([...APP_TARGETS, 'account-engine'], {
    vite: 'VITE_ANALYTICS_ENGINE_URL',
    expo: 'EXPO_PUBLIC_ANALYTICS_ENGINE_URL',
  }),
  PODCAST_API_URL: client(APP_TARGETS, {
    vite: 'VITE_PODCAST_API_URL',
    expo: 'EXPO_PUBLIC_PODCAST_API_URL',
  }),
  CACHE_MAX_AGE_SECONDS: client(WEB_TARGETS, {
    vite: 'VITE_CACHE_MAX_AGE_SECONDS',
  }),
  CACHE_STALE_WHILE_REVALIDATE_SECONDS: client(WEB_TARGETS, {
    vite: 'VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS',
  }),
  PRIVY_WEB_APP_ID: client(
    WEB_TARGETS,
    { vite: 'VITE_PRIVY_APP_ID', expo: 'EXPO_PUBLIC_PRIVY_APP_ID' },
    {
      requiredFor: ['web:base', 'desktop:base'],
      sensitive: true,
    },
  ),
  PRIVY_MOBILE_APP_ID: client(
    ['expo'],
    {
      expo: 'EXPO_PUBLIC_PRIVY_APP_ID',
    },
    { requiredFor: ['expo:base'], sensitive: true },
  ),
  PRIVY_MOBILE_CLIENT_ID: client(
    ['expo'],
    {
      expo: 'EXPO_PUBLIC_PRIVY_CLIENT_ID',
    },
    { requiredFor: ['expo:base'], sensitive: true },
  ),
  MORALIS_API_KEY: client(
    APP_TARGETS,
    {
      vite: 'VITE_MORALIS_API_KEY',
      expo: 'EXPO_PUBLIC_MORALIS_API_KEY',
    },
    { sensitive: true },
  ),
  ALCHEMY_API_KEY: client(
    APP_TARGETS,
    {
      vite: 'VITE_ALCHEMY_API_KEY',
      expo: 'EXPO_PUBLIC_ALCHEMY_API_KEY',
    },
    { sensitive: true },
  ),
  ENABLE_RQ_DEVTOOLS: client(WEB_TARGETS, {
    vite: 'VITE_ENABLE_RQ_DEVTOOLS',
  }),
  ENABLE_DEBUG_LOGGING: client(WEB_TARGETS, {
    vite: 'VITE_ENABLE_DEBUG_LOGGING',
  }),
  ENABLE_DEV_LOGGING: client(WEB_TARGETS, {
    vite: 'VITE_ENABLE_DEV_LOGGING',
  }),
  IPFS_GATEWAY: client(['landing-page'], {
    next: 'NEXT_PUBLIC_IPFS_GATEWAY',
  }),
  IPFS_GATEWAY_FALLBACK: client(['landing-page'], {
    next: 'NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK',
  }),
  GA_ID: client(['landing-page'], { next: 'NEXT_PUBLIC_GA_ID' }),
  TRACK_RECORD_MOCK: client(['landing-page'], {
    next: 'NEXT_PUBLIC_TRACK_RECORD_MOCK',
  }),

  NODE_ENV: host(['all']),
  ALPHA_ETL_DATABASE_URL: server(['alpha-etl'], {
    requiredFor: ['alpha-etl:base'],
    sensitive: true,
  }),
  SUPABASE_URL: server(
    ['account-engine', 'podcast-pipeline', 'control-center'],
    {
      requiredFor: ['account-engine:base', 'podcast-pipeline:base'],
      sensitive: true,
    },
  ),
  SUPABASE_ANON_KEY: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
    sensitive: true,
  }),
  SUPABASE_SERVICE_ROLE_KEY: server(
    ['account-engine', 'podcast-pipeline', 'control-center'],
    {
      requiredFor: ['account-engine:base', 'podcast-pipeline:base'],
      sensitive: true,
    },
  ),
  ALPHA_ETL_URL: server(['account-engine']),
  ALPHA_ETL_WEBHOOK_SECRET: server(['account-engine'], { sensitive: true }),
  ACCOUNT_ENGINE_PORT: host(['account-engine']),
  SENTRY_DSN: server(['account-engine'], { sensitive: true }),
  EMAIL_HOST: server(['account-engine']),
  EMAIL_USER: server(['account-engine'], { sensitive: true }),
  EMAIL_APP_PASSWORD: server(['account-engine'], { sensitive: true }),
  REPORT_UNSUBSCRIBE_SECRET: server(['account-engine'], { sensitive: true }),
  REPORT_UNSUBSCRIBE_URL: server(['account-engine']),
  NOTIFICATIONS_TEST_RECIPIENT: server(['account-engine'], {
    sensitive: true,
  }),
  ADMIN_NOTIFICATIONS_ENABLED: server(['account-engine']),
  LIFI_INTEGRATOR: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
  }),
  LIFI_API_KEY: server(['account-engine'], { sensitive: true }),
  DEPOSIT_DEFAULT_SPLIT: server(['account-engine']),
  HYPERLIQUID_NETWORK: server(['account-engine']),
  RPC_URL_BASE: server(['account-engine'], { sensitive: true }),
  RPC_URL_ETHEREUM: server(['account-engine'], { sensitive: true }),
  RPC_URL_ARBITRUM: server(['account-engine'], { sensitive: true }),
  PRIVY_APP_ID: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
    sensitive: true,
  }),
  PRIVY_APP_SECRET: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
    sensitive: true,
  }),
  ADMIN_API_KEY: server(['account-engine'], { sensitive: true }),
  TELEGRAM_BOT_TOKEN: server(['account-engine'], { sensitive: true }),
  TELEGRAM_BOT_NAME: server(['account-engine']),
  TELEGRAM_WEBHOOK_SECRET: server(['account-engine'], { sensitive: true }),
  TRACK_RECORD_EQUITY_CURVE_URL: server(['account-engine']),
  TENDERLY_ACCOUNT_SLUG: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
    sensitive: true,
  }),
  TENDERLY_PROJECT_SLUG: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
    sensitive: true,
  }),
  TENDERLY_ACCESS_TOKEN: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
    sensitive: true,
  }),
  PLAN_SIMULATION_REQUIRED: server(['account-engine'], {
    requiredFor: ['account-engine:base'],
  }),
  PLAN_SIMULATION_MODE: server(['account-engine']),

  ANALYTICS_ENGINE_PORT: host(['analytics-engine']),
  DATABASE_READ_ONLY: server(['analytics-engine']),
  DATABASE_READ_ONLY_URL: server(['analytics-engine'], {
    requiredFor: ['analytics-engine:base'],
    sensitive: true,
  }),
  CORS_ALLOWED_ORIGINS: server(['analytics-engine']),
  DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT: server(['analytics-engine']),
  DB_STATEMENT_TIMEOUT: server(['analytics-engine']),
  ANALYTICS_CACHE_ENABLED: server(['analytics-engine']),
  ANALYTICS_CACHE_DEFAULT_TTL_HOURS: server(['analytics-engine']),
  ANALYTICS_CACHE_MAX_ENTRIES: server(['analytics-engine']),
  HTTP_CACHE_MAX_AGE_SECONDS: server(['analytics-engine']),
  HTTP_CACHE_STALE_WHILE_REVALIDATE_SECONDS: server(['analytics-engine']),
  MARKET_SENTIMENT_API_URL: server(['analytics-engine']),
  MARKET_SENTIMENT_TIMEOUT_SECONDS: server(['analytics-engine']),
  MARKET_SENTIMENT_CACHE_TTL_SECONDS: server(['analytics-engine']),
  MARKET_SENTIMENT_USER_AGENT: server(['analytics-engine']),
  USE_SENTIMENT_DATABASE: server(['analytics-engine']),
  ANALYTICS_RISK_FREE_RATE_ANNUAL: server(['analytics-engine']),
  DB_POOL_SIZE: server(['analytics-engine']),
  DB_POOL_MAX_OVERFLOW: server(['analytics-engine']),
  DB_POOL_TIMEOUT: server(['analytics-engine']),
  DB_POOL_RECYCLE: server(['analytics-engine']),

  // Advanced Pydantic component settings are configurable but intentionally
  // omitted from .env.example because their in-code defaults are canonical.
  TOLERANCE: server(['analytics-engine'], { documented: false }),
  PERCENTAGE_TOLERANCE: server(['analytics-engine'], { documented: false }),
  MIN_APR: server(['analytics-engine'], { documented: false }),
  MAX_APR: server(['analytics-engine'], { documented: false }),
  MAX_PORTFOLIO_VALUE: server(['analytics-engine'], { documented: false }),
  MIN_USD_VALUE: server(['analytics-engine'], { documented: false }),
  MIN_PERCENTAGE: server(['analytics-engine'], { documented: false }),
  MAX_PERCENTAGE: server(['analytics-engine'], { documented: false }),
  MIN_COUNT: server(['analytics-engine'], { documented: false }),
  MAX_TOKEN_COUNT: server(['analytics-engine'], { documented: false }),
  MAX_WALLET_COUNT: server(['analytics-engine'], { documented: false }),
  USD_DECIMAL_PLACES: server(['analytics-engine'], { documented: false }),
  PERCENTAGE_DECIMAL_PLACES: server(['analytics-engine'], {
    documented: false,
  }),
  MAX_DEBT_TO_ASSETS_RATIO: server(['analytics-engine'], { documented: false }),
  ANALYTICS_SHARPE_POOR_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_SHARPE_BELOW_AVG_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_SHARPE_GOOD_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_SHARPE_VERY_GOOD_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_VOLATILITY_VERY_LOW_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_VOLATILITY_LOW_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_VOLATILITY_MODERATE_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_VOLATILITY_HIGH_THRESHOLD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_ROLLING_WINDOW_DAYS: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_RELIABILITY_MIN_PERIOD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_RELIABILITY_ROBUST_PERIOD: server(['analytics-engine'], {
    documented: false,
  }),
  ANALYTICS_RELIABILITY_MIN_WINDOW_RATIO: server(['analytics-engine'], {
    documented: false,
  }),

  DB_SCHEMA: server(['alpha-etl']),
  ALPHA_ETL_PORT: host(['alpha-etl']),
  HOST: host(['alpha-etl', 'analytics-engine']),
  WEBHOOK_SECRET: server(['alpha-etl'], { sensitive: true }),
  DEBANK_API_URL: server(['alpha-etl']),
  DEBANK_API_KEY: server(['alpha-etl', 'control-center'], { sensitive: true }),
  DEBANK_BASE_URL: server(['control-center']),
  DEBANK_STRICT_ERRORS: server(['alpha-etl'], { environments: ['dev'] }),
  HYPERLIQUID_API_URL: server(['alpha-etl']),
  HYPERLIQUID_RATE_LIMIT_RPM: server(['alpha-etl']),
  COINGECKO_API_URL: server(['alpha-etl']),
  RATE_LIMIT_REQUESTS_PER_MINUTE: server(['alpha-etl']),
  RATE_LIMIT_BURST: server(['alpha-etl']),
  LOG_LEVEL: server(['alpha-etl', 'podcast-pipeline']),
  MOCK_APIS: server(['alpha-etl'], { environments: ['dev'] }),
  COINMARKETCAP_API_KEY: server(['alpha-etl'], { sensitive: true }),
  COINMARKETCAP_API_URL: server(['alpha-etl']),
  ALPHA_VANTAGE_API_KEY: server(['alpha-etl'], { sensitive: true }),

  OPENROUTER_API_KEY: server(['podcast-pipeline', 'control-center'], {
    sensitive: true,
  }),
  OPENROUTER_BASE_URL: server(['podcast-pipeline', 'control-center']),
  OPENROUTER_MANAGEMENT_KEY: server(['control-center'], { sensitive: true }),
  OPENROUTER_TIMEOUT_MS: server(['podcast-pipeline']),
  LLM_MODEL: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:base'],
  }),
  LLM_THINKING_MODEL: server(['podcast-pipeline']),
  TRANSLATION_LLM_MODEL: server(['podcast-pipeline']),
  GOOGLE_TRANSLATE_API_KEY: server(['podcast-pipeline'], { sensitive: true }),
  GOOGLE_APPLICATION_CREDENTIALS_BASE64: server(['podcast-pipeline'], {
    sensitive: true,
  }),
  GOOGLE_APPLICATION_CREDENTIALS: host(['podcast-pipeline']),
  YOUTUBE_CLIENT_ID: server(['podcast-pipeline'], { sensitive: true }),
  YOUTUBE_CLIENT_SECRET: server(['podcast-pipeline'], { sensitive: true }),
  YOUTUBE_CHANNEL_ID: server(['podcast-pipeline'], { sensitive: true }),
  YOUTUBE_API_KEY: server(['podcast-pipeline'], { sensitive: true }),
  TTS_PROVIDER: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:base'],
  }),
  FISH_AUDIO_API_KEY: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:fish-audio'],
    sensitive: true,
  }),
  FISH_AUDIO_ENGINE: server(['podcast-pipeline']),
  FISH_AUDIO_REFERENCE_ID: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:fish-audio'],
    sensitive: true,
  }),
  FISH_AUDIO_RETRY_DELAY_MS: server(['podcast-pipeline']),
  FISH_AUDIO_TIMEOUT_MS: server(['podcast-pipeline']),
  FISH_AUDIO_IDLE_TIMEOUT_MS: server(['podcast-pipeline']),
  FISH_AUDIO_MAX_CHARS_PER_REQUEST: server(['podcast-pipeline']),
  FISH_AUDIO_REQUEST_DELAY_MS: server(['podcast-pipeline']),
  R2_ENDPOINT: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:media'],
    sensitive: true,
  }),
  R2_ACCESS_KEY_ID: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:media'],
    sensitive: true,
  }),
  R2_SECRET_ACCESS_KEY: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:media'],
    sensitive: true,
  }),
  R2_BUCKET_NAME: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:media'],
    sensitive: true,
  }),
  R2_PUBLIC_BASE_URL: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:media'],
  }),
  PIPELINE_TELEGRAM_BOT_TOKEN: server(['podcast-pipeline'], {
    sensitive: true,
  }),
  PIPELINE_TELEGRAM_WEBHOOK_SECRET: server(['podcast-pipeline'], {
    sensitive: true,
  }),
  PIPELINE_TELEGRAM_ALLOWED_USER_IDS: server(['podcast-pipeline'], {
    sensitive: true,
  }),
  PIPELINE_TELEGRAM_ALLOWED_SOURCE_HOSTS: server(['podcast-pipeline']),
  INGEST_ADMIN_TOKEN: server(['podcast-pipeline'], { sensitive: true }),
  SCRIPT_PROMPT_PATH: server(['podcast-pipeline']),
  PODCAST_PUBLIC_BASE_URL: server(['podcast-pipeline']),
  CONTROL_CENTER_PORT: server(['control-center']),
  CONTROL_CENTER_CACHE_TTL_MS: server(['control-center']),
  FLY_COST_MODE: server(['control-center']),
  SOCIAL_PUBLISH_SKIP_OVERDUE_MINUTES: server(['podcast-pipeline']),
  THREADS_APP_ID: server(['podcast-pipeline'], { sensitive: true }),
  THREADS_APP_SECRET: server(['podcast-pipeline'], { sensitive: true }),
  THREADS_ACCESS_TOKEN: server(['podcast-pipeline'], { sensitive: true }),
  THREADS_REDIRECT_URI: server(['podcast-pipeline']),
  THREADS_TLS_CERT_PATH: host(['podcast-pipeline']),
  THREADS_TLS_KEY_PATH: host(['podcast-pipeline']),
  PIPELINE_RENDER_ON_DEMAND: server(['podcast-pipeline']),
  PIPELINE_FLY_API_TOKEN: server(['podcast-pipeline'], { sensitive: true }),
  FLY_APP_NAME: host(['podcast-pipeline']),
  VIDEO_STORYBOARD_PROVIDER: server(['podcast-pipeline']),
  NVIDIA_API_KEY: server(['podcast-pipeline'], { sensitive: true }),
  NVIDIA_BASE_URL: server(['podcast-pipeline']),
  NVIDIA_STORYBOARD_MODEL: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:base'],
  }),
  VIDEO_ALIGNMENT_PROVIDER: server(['podcast-pipeline']),
  VIDEO_ALIGNMENT_MODEL: server(['podcast-pipeline'], {
    requiredFor: ['podcast-pipeline:base'],
  }),
  VIDEO_FFMPEG_PATH: host(['podcast-pipeline']),
  VIDEO_FFPROBE_PATH: host(['podcast-pipeline']),
  PEXELS_API_KEY: server(['podcast-pipeline'], { sensitive: true }),
  PIXABAY_API_KEY: server(['podcast-pipeline'], { sensitive: true }),
  SUPABASE_DB_SCHEMA: server(['podcast-pipeline', 'control-center']),

  ZAP_ELECTRON_DEV_URL: host(['desktop']),
  ZAP_ELECTRON_WEB_ROOT: host(['desktop']),
  ZAP_ELECTRON_LOOPBACK: host(['desktop']),
  ZAP_ELECTRON_LOOPBACK_PORT: host(['desktop']),
  ZAP_REBALANCE_CHECK_INTERVAL_MS: host(['desktop']),
  ZAP_REBALANCE_DRIFT_THRESHOLD: host(['desktop']),
  ZAP_IOS_CLEAN_PREBUILD: host(['expo']),
  ZAP_SKIP_DIST_FRESHNESS_CHECK: host(['expo']),

  // CI, build, and operational tooling. These remain inventoried without
  // encouraging developers to place ephemeral values in their local .env.
  CI: host(['all'], { documented: false }),
  PORT: host(['all'], { documented: false }),
  TEST_DATABASE_URL: server(['analytics-engine'], {
    documented: false,
    environments: [],
    sensitive: true,
  }),
  DATABASE_INTEGRATION_URL: server(['analytics-engine'], {
    documented: false,
    environments: [],
    sensitive: true,
  }),
  EAS_BUILD: host(['expo'], { documented: false }),
  EAS_BUILD_PROFILE: host(['expo'], { documented: false }),
  PLAYWRIGHT_BASE_URL: host(['expo'], { documented: false }),
  PLAYWRIGHT_PORT: host(['expo'], { documented: false }),
  PLAYWRIGHT_SKIP_INSTALL: host(['expo'], { documented: false }),
  EXPO_TOKEN: host(['env-tooling'], {
    documented: false,
    sensitive: true,
  }),
  FLY_API_TOKEN: host(['env-tooling'], {
    documented: false,
    sensitive: true,
  }),
  INFISICAL_PROJECT_ID: host(['env-tooling'], {
    documented: false,
    sensitive: true,
  }),
  VERCEL_TOKEN: host(['env-tooling'], {
    documented: false,
    sensitive: true,
  }),
  TRACK_RECORD_CHAIN_IDS: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_RPC_URLS: server(['track-record-tooling'], {
    documented: false,
    sensitive: true,
  }),
  TRACK_RECORD_WALLET_ADDRESSES: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_TOKENS_JSON: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_PRICE_ORACLE_URL: server(['track-record-tooling'], {
    documented: false,
    sensitive: true,
  }),
  TRACK_RECORD_PRICE_ORACLE_JSON: server(['track-record-tooling'], {
    documented: false,
    sensitive: true,
  }),
  TRACK_RECORD_HISTORY_JSON: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_INITIAL_NAV_USD: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_SIGNER_PRIVATE_KEY: server(['track-record-tooling'], {
    documented: false,
    sensitive: true,
  }),
  TRACK_RECORD_PREVIOUS_CID: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_SCHEMA_VERSION: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_STRATEGY_ID: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_STRATEGY_VERSION: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_DATE: server(['track-record-tooling'], { documented: false }),
  TRACK_RECORD_COSTS_JSON: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_TRANSACTIONS_JSON: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_IPFS_PINATA_TOKEN: server(['track-record-tooling'], {
    documented: false,
    sensitive: true,
  }),
  TRACK_RECORD_IPFS_PIN_ENDPOINT: server(['track-record-tooling'], {
    documented: false,
  }),
  TRACK_RECORD_META_URL: server(['track-record-tooling'], {
    documented: false,
  }),
};

export const ENV_TARGETS = [
  ...new Set(
    Object.values(ENV_MANIFEST)
      .flatMap((entry) => entry.targets)
      .filter((target) => target !== 'all'),
  ),
].sort();

export const LEGACY_ENV_NAMES = {
  VITE_ACCOUNT_API_URL: 'ACCOUNT_API_URL',
  VITE_ANALYTICS_ENGINE_URL: 'ANALYTICS_ENGINE_URL',
  VITE_PODCAST_API_URL: 'PODCAST_API_URL',
  VITE_CACHE_MAX_AGE_SECONDS: 'CACHE_MAX_AGE_SECONDS',
  VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS:
    'CACHE_STALE_WHILE_REVALIDATE_SECONDS',
  VITE_PRIVY_APP_ID: 'PRIVY_WEB_APP_ID',
  VITE_MORALIS_API_KEY: 'MORALIS_API_KEY',
  VITE_ALCHEMY_API_KEY: 'ALCHEMY_API_KEY',
  VITE_ENABLE_RQ_DEVTOOLS: 'ENABLE_RQ_DEVTOOLS',
  VITE_ENABLE_DEBUG_LOGGING: 'ENABLE_DEBUG_LOGGING',
  VITE_ENABLE_DEV_LOGGING: 'ENABLE_DEV_LOGGING',
  NEXT_PUBLIC_IPFS_GATEWAY: 'IPFS_GATEWAY',
  NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK: 'IPFS_GATEWAY_FALLBACK',
  NEXT_PUBLIC_GA_ID: 'GA_ID',
  NEXT_PUBLIC_TRACK_RECORD_MOCK: 'TRACK_RECORD_MOCK',
  EXPO_PUBLIC_PRIVY_APP_ID: 'PRIVY_MOBILE_APP_ID',
  EXPO_PUBLIC_PRIVY_CLIENT_ID: 'PRIVY_MOBILE_CLIENT_ID',
  EXPO_PUBLIC_ACCOUNT_API_URL: 'ACCOUNT_API_URL',
  EXPO_PUBLIC_ANALYTICS_ENGINE_URL: 'ANALYTICS_ENGINE_URL',
  EXPO_PUBLIC_ALCHEMY_API_KEY: 'ALCHEMY_API_KEY',
  EXPO_PUBLIC_MORALIS_API_KEY: 'MORALIS_API_KEY',
  EXPO_PUBLIC_PODCAST_API_URL: 'PODCAST_API_URL',
  ZAP_ACCOUNT_API_URL: 'ACCOUNT_API_URL',
  ZAP_ANALYTICS_ENGINE_URL: 'ANALYTICS_ENGINE_URL',
};
