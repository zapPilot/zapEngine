import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Env must be injected before any app-core module evaluates (expo-router/entry
// pulls in the whole route tree).
import './src/config/configureAppCoreEnv';

// Sentry reads the projected Expo env, so it must initialize after env setup
// and before expo-router evaluates the application route tree.
import './src/observability/configureSentry';

// app-core reports handled errors through an injected seam, so it has to be
// bound after Sentry init and before expo-router evaluates the route tree —
// anything that fails during the first render otherwise reports to nobody.
import './src/observability/registerQueryErrorReporter';

// Must register its window listeners before expo-router/entry evaluates so
// wallet-extension inpage errors never reach the dev error overlay.
import './src/config/ignoreExtensionErrors';

// PostHog initializes on import (web only; the native module is inert). It has
// to run before the route tree evaluates or the session's first $pageview is
// never captured.
import './src/observability/analytics';

// NativeWind style registry — Metro intercepts this import.
import './global.css';

import 'expo-router/entry';
