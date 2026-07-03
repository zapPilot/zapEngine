import { defineConfig } from 'eslint/config';
import expoConfig from 'eslint-config-expo/flat.js';

export default defineConfig([
  ...expoConfig,
  {
    ignores: ['dist/**', 'coverage/**', '.expo/**'],
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
              name: 'hls.js',
              message:
                'hls.js is web-only. Native podcast playback must use expo-audio.',
            },
            {
              name: 'lucide-react',
              message:
                'Use lucide-react-native in mobile-v2; lucide-react targets the DOM.',
            },
            {
              name: 'react-dom',
              message:
                'react-dom is web-only and must not enter the native app.',
            },
            {
              name: 'react-router-dom',
              message:
                'Use expo-router in mobile-v2; react-router-dom targets the DOM.',
            },
            {
              name: 'recharts',
              message:
                'Recharts targets the DOM/SVG web stack. Use RN chart primitives instead.',
            },
            {
              name: '@zapengine/app-core/hooks',
              message:
                'Do not import the broad hooks barrel on React Native. Import RN-safe hooks from @zapengine/app-core/hooks/analytics or @zapengine/app-core/hooks/queries instead.',
            },
          ],
          patterns: [
            {
              group: [
                'react-dom/*',
                '@zapengine/app-core/hooks/ui',
                '@zapengine/app-core/hooks/ui/**',
                '@zapengine/app-core/hooks/bundle',
                '@zapengine/app-core/hooks/bundle/**',
                '@zapengine/app-core/hooks/wallet',
                '@zapengine/app-core/hooks/wallet/**',
              ],
              message:
                'Web-only app-core hooks (DOM / Privy web SDK). Use the RN-safe data hooks from @zapengine/app-core/hooks/queries instead.',
            },
            {
              group: [
                '@zapengine/app-core/providers/PrivyAuthProvider',
                '@zapengine/app-core/providers/WalletProvider',
                '@zapengine/app-core/providers/QueryProvider',
              ],
              message:
                'Web-only app-core providers. Use WalletProviderBase from @zapengine/app-core/providers/walletContext and QueryClientProvider with the shared queryClient from @zapengine/app-core/lib/state/queryClient instead.',
            },
            {
              group: [
                '@zapengine/app-core/lib/csvGenerator',
                '@zapengine/app-core/utils/clipboard',
                '@zapengine/app-core/services/analyticsExportService',
              ],
              message:
                'Browser-only DOM UX helpers (download links / clipboard) — they throw at runtime on React Native.',
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
]);
