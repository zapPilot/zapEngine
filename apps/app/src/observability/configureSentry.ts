import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { logSentryBootStatus } from './sentryBootLog';
import { buildAppSentryOptions } from './sentryOptions';

const release = Constants.expoConfig?.version;
const options = buildAppSentryOptions(
  process.env.EXPO_PUBLIC_SENTRY_DSN,
  release,
);

if (options) {
  Sentry.init(options);
}

logSentryBootStatus(
  Boolean(options),
  typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production',
  release?.trim() || 'unknown',
);
