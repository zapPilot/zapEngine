import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/**', 'coverage/**', '.expo/**', 'bundle-bytecode.js'],
  },
  {
    // Boundary guard: only the RN-safe surface of app-core may be imported here
    // (see packages/app-core/CLAUDE.md for the full boundary table).
    files: ['**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@privy-io/react-auth',
              message:
                '@privy-io/react-auth is web-only. Native wallet auth must use @privy-io/expo.',
            },
            {
              name: 'hls.js',
              message:
                'hls.js is web-only. Native podcast playback must use expo-audio.',
            },
            {
              name: 'lucide-react',
              message:
                'Use lucide-react-native in app; lucide-react targets the DOM.',
            },
            {
              name: 'react-dom',
              message:
                'react-dom is web-only and must not enter the native app.',
            },
            {
              name: 'react-router-dom',
              message:
                'Use expo-router in app; react-router-dom targets the DOM.',
            },
            {
              name: 'recharts',
              message:
                'Recharts targets the DOM/SVG web stack. Use RN chart primitives instead.',
            },
            {
              name: '@zapengine/app-core/hooks',
              message:
                'Do not import the broad hooks barrel on React Native. Import the specific hook module instead.',
            },
            {
              name: '@zapengine/app-core/services',
              message:
                'Do not import the services barrel in the app. Deep-import the exact service module so native bundles cannot pull transaction/exchange siblings transitively.',
            },
            {
              name: '@zapengine/app-core/hooks/queries',
              message:
                'Do not import the hooks/queries barrel. Deep-import the exact query hook or queryDefaults module.',
            },
            {
              name: '@zapengine/app-core/hooks/wallet',
              message:
                'Do not import the hooks/wallet barrel. Deep-import the exact wallet hook module.',
            },
            {
              name: '@zapengine/app-core/hooks/analytics',
              message:
                'Do not import the hooks/analytics barrel. Deep-import the exact analytics hook module.',
            },
            {
              name: '@zapengine/app-core/adapters',
              message:
                'Do not import the adapters barrel. Deep-import the exact adapter module.',
            },
            {
              name: '@zapengine/app-core/utils',
              message:
                'Do not import the utils barrel. Deep-import the exact formatter/math utility module.',
            },
            {
              name: 'wagmi',
              message:
                'wagmi is web/desktop-only. Native wallet auth must use @privy-io/expo.',
            },
          ],
          patterns: [
            {
              group: [
                '@privy-io/react-auth/*',
                'react-dom/*',
                '@zapengine/app-core/hooks/wallet/usePrivyWalletBackend',
                '@zapengine/app-core/hooks/wallet/useWagmiWalletBackend',
              ],
              message:
                'Web-only app-core hooks (DOM / Privy web SDK / wagmi). The hooks/wallet barrel is RN-safe apart from the Privy/wagmi backends; use it or an RN-safe data hook, imported by its own module path rather than through the hooks/queries barrel.',
            },
            {
              group: [
                '@zapengine/app-core/providers/PrivyAuthProvider',
                '@zapengine/app-core/providers/WalletProvider',
                '@zapengine/app-core/providers/Web3Provider',
                '@zapengine/app-core/providers/walletLoginContext',
              ],
              message:
                'Web-only app-core providers. Use WalletProviderBase from @zapengine/app-core/providers/walletContext and QueryClientProvider with the shared queryClient from @zapengine/app-core/lib/state/queryClient instead.',
            },
            {
              group: ['wagmi/**', '@zapengine/app-core/config/wagmi'],
              message:
                'wagmi is web/desktop-only and must not enter the native bundle.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/**/*.web.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@privy-io/expo',
              message:
                '@privy-io/expo is native-only. Web auth must use @privy-io/react-auth through app-core.',
            },
            {
              name: '@privy-io/expo/ui',
              message:
                '@privy-io/expo/ui is native-only. Web auth must use @privy-io/react-auth through app-core.',
            },
            {
              name: '@privy-io/expo-native-extensions',
              message:
                '@privy-io/expo-native-extensions is native-only and must not enter the web bundle.',
            },
            {
              name: 'expo-secure-store',
              message:
                'expo-secure-store is native-only. Web code must use web-safe storage abstractions.',
            },
            {
              name: 'react-native-passkeys',
              message:
                'react-native-passkeys is native-only and must not enter the web bundle.',
            },
          ],
          patterns: [
            {
              group: ['@privy-io/expo/*', 'expo-secure-store/*'],
              message:
                'Native-only Privy and secure-store modules must stay out of web platform files.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/integration/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "ImportDeclaration[source.value='react-native']",
          message:
            'src/integration must stay platform-neutral; keep React Native imports in screens, components, or providers.',
        },
      ],
    },
  },
  {
    // React Native discards a press/gesture handler's return value, so an async
    // JSX handler hands its promise to nobody: a rejection inside it becomes an
    // unhandled rejection and is reported to Sentry as a production error (see
    // src/integration/requestAccountConnection.ts).
    files: ['src/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector:
            'JSXAttribute[name.name=/^on[A-Z]/] > JSXExpressionContainer > :matches(ArrowFunctionExpression, FunctionExpression)[async=true]',
          message:
            'A JSX event handler must not be async: its promise is discarded, so a rejection goes unhandled. Call a fire-and-forget helper that catches, or handle the promise inside a synchronous handler.',
        },
      ],
    },
  },
  {
    // React provider/lifecycle tests render into jsdom; DOM imports here never
    // enter the universal app bundle.
    files: ['tests/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
]);
