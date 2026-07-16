import 'fast-text-encoding';
import 'react-native-get-random-values';
import '@ethersproject/shims';

// Env must be injected before any app-core module evaluates (expo-router/entry
// pulls in the whole route tree).
import './src/config/configureAppCoreEnv';

// NativeWind style registry — Metro intercepts this import.
import './global.css';

import 'expo-router/entry';
