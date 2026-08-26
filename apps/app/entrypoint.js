import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Env must be injected before any app-core module evaluates (expo-router/entry
// pulls in the whole route tree).
import './src/config/configureAppCoreEnv';

// Sentry reads the projected Expo env, so it must initialize after env setup
// and before expo-router evaluates the application route tree.
import './src/observability/configureSentry';

// Must register its window listeners before expo-router/entry evaluates so
// wallet-extension inpage errors never reach the dev error overlay.
import './src/config/ignoreExtensionErrors';

// NativeWind style registry — Metro intercepts this import.
import './global.css';

import 'expo-router/entry';
