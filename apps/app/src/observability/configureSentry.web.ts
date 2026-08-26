import { init as initElectronSentry } from '@sentry/electron/renderer';
import * as ReactNativeSentry from '@sentry/react-native';
import Constants from 'expo-constants';

import { buildAppSentryOptions } from './sentryOptions';

const isElectronRenderer =
  typeof window !== 'undefined' && 'zapDesktop' in window;

if (isElectronRenderer) {
  // The renderer receives its DSN and release from the Electron main process.
  initElectronSentry({
    autoSessionTracking: false,
    enableLogs: false,
    sendDefaultPii: false,
  });
} else {
  const options = buildAppSentryOptions(
    process.env.EXPO_PUBLIC_SENTRY_DSN,
    Constants.expoConfig?.version,
  );

  if (options) {
    ReactNativeSentry.init(options);
  }
}
