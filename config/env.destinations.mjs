export const ENV_DESTINATIONS = {
  'account-engine': {
    platform: 'fly',
    app: 'account-engine',
    environment: 'prod',
    target: 'account-engine',
    managed: ['FLY_APP_NAME', 'NODE_ENV', 'PORT'],
  },
  'alpha-etl': {
    platform: 'fly',
    app: 'alpha-etl',
    environment: 'prod',
    target: 'alpha-etl',
    managed: ['FLY_APP_NAME', 'NODE_ENV', 'PORT'],
  },
  'analytics-engine': {
    platform: 'fly',
    app: 'analytics-engine-xws3ra',
    environment: 'prod',
    target: 'analytics-engine',
    managed: ['FLY_APP_NAME', 'NODE_ENV', 'PORT'],
  },
  'podcast-pipeline': {
    platform: 'fly',
    app: 'from-fed-to-chain-api',
    environment: 'prod',
    target: 'podcast-pipeline',
    managed: ['FLY_APP_NAME', 'NODE_ENV', 'PORT'],
  },
  expo: {
    platform: 'eas',
    environment: 'production',
    sourceEnvironment: 'prod',
    target: 'expo',
    managed: ['EAS_BUILD', 'EAS_BUILD_PROFILE'],
  },
  web: {
    platform: 'vercel',
    project: 'zap-engine-frontend',
    environment: 'production',
    sourceEnvironment: 'prod',
    target: 'web',
    managed: ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL'],
  },
  'landing-page': {
    platform: 'vercel',
    project: 'landing-page',
    environment: 'production',
    sourceEnvironment: 'prod',
    target: 'landing-page',
    managed: ['VERCEL', 'VERCEL_ENV', 'VERCEL_URL'],
  },
};

export const DESTINATION_NAMES = Object.keys(ENV_DESTINATIONS).sort();
