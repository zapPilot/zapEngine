import { init as initElectronSentry } from '@sentry/electron/renderer';
import * as ReactNativeSentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { logSentryBootStatus } from './sentryBootLog';
import { buildAppSentryOptions } from './sentryOptions';

const isElectronRenderer =
  typeof window !== 'undefined' && 'zapDesktop' in window;

if (isElectronRenderer) {
  // The renderer receives its DSN and release from the Electron main process,
  // which owns its own boot log — nothing to report from here.
  initElectronSentry({
    autoSessionTracking: false,
    enableLogs: false,
    sendDefaultPii: false,
  });
} else {
  const release = Constants.expoConfig?.version;
  const options = buildAppSentryOptions(
    process.env.EXPO_PUBLIC_SENTRY_DSN,
    release,
  );

  if (options) {
    ReactNativeSentry.init(options);
  }

  logSentryBootStatus(
    Boolean(options),
    typeof __DEV__ !== 'undefined' && __DEV__ ? 'development' : 'production',
    release?.trim() || 'unknown',
  );
}
