import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Env must be injected before any app-core module evaluates (expo-router/entry
// pulls in the whole route tree).
import './src/config/configureAppCoreEnv';

// Must register its window listeners before expo-router/entry evaluates so
// wallet-extension inpage errors never reach the dev error overlay.
import './src/config/ignoreExtensionErrors';

// NativeWind style registry — Metro intercepts this import.
import './global.css';

import 'expo-router/entry';
