import * as Sentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { buildAppSentryOptions } from './sentryOptions';

const options = buildAppSentryOptions(
  process.env.EXPO_PUBLIC_SENTRY_DSN,
  Constants.expoConfig?.version,
);

if (options) {
  Sentry.init(options);
}
