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
          patterns: [
            {
              group: [
                '@zapengine/app-core/hooks',
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
]);
