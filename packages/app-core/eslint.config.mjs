// @ts-check
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Modules that intentionally depend on the DOM or web-only libraries at
// RUNTIME (type-only imports are erased and always allowed), plus the barrels
// that re-export them. Everything else in src must stay React Native-safe —
// see CLAUDE.md for the boundary table.
const WEB_ONLY_FILES = [
  'src/hooks/index.ts',
  'src/hooks/ui/**',
  'src/hooks/bundle/**',
  'src/hooks/wallet/index.ts',
  'src/hooks/wallet/usePrivyWalletBackend.ts',
  'src/hooks/wallet/useEtlJobSync.ts',
  'src/hooks/wallet/useAccountDeletion.ts',
  'src/providers/PrivyAuthProvider.tsx',
  'src/providers/WalletProvider.tsx',
  'src/providers/QueryProvider.tsx',
  'src/lib/csvGenerator.ts',
  'src/services/index.ts',
  'src/services/analyticsExportService.ts',
  'src/utils/index.ts',
  'src/utils/clipboard.ts',
];

const WEB_ONLY_IMPORT_PATHS = [
  '@privy-io/react-auth',
  'framer-motion',
  'lucide-react',
  '@tanstack/react-query-devtools',
].map((name) => ({
  name,
  allowTypeImports: true,
  message: `${name} is web-only; keep it out of RN-safe modules (see CLAUDE.md boundary table).`,
}));

// Internal modules that pull the DOM or web-only packages in transitively.
// RN-safe code must not import them at runtime (type-only imports are fine);
// web-only files (above) are exempt. Matches `@core/...` and relative
// specifiers alike.
const WEB_ONLY_INTERNAL_PATTERNS = [
  {
    group: [
      '**/providers/WalletProvider',
      '**/providers/PrivyAuthProvider',
      '**/providers/QueryProvider',
      '**/hooks/wallet/usePrivyWalletBackend',
      '**/hooks/wallet/useEtlJobSync',
      '**/hooks/wallet/useAccountDeletion',
      '**/hooks/ui',
      '**/hooks/ui/*',
      '**/hooks/bundle/useBundlePage',
      '**/hooks/bundle/useWalletOperations',
      '**/lib/csvGenerator',
      '**/services/analyticsExportService',
      '**/utils/clipboard',
    ],
    allowTypeImports: true,
    message:
      'Web-only internal module; RN-safe code must not import it at runtime (wallet context: providers/walletContext; query client: lib/state/queryClient — see CLAUDE.md boundary table).',
  },
];

export default createReactViteConfig({
  tsconfigPath: join(__dirname, 'tsconfig.eslint.json'),
  tsconfigRootDir: __dirname,
  extraConfigs: [
    {
      files: ['src/**/*.{ts,tsx}'],
      rules: {
        // Hosts inject env via configureAppCoreEnv; import.meta is Vite-only
        // and breaks Metro/Node consumers.
        'no-restricted-syntax': [
          'error',
          {
            selector: 'MetaProperty',
            message:
              'import.meta is banned in app-core. Read env lazily through getRuntimeEnv; apps inject values via configureAppCoreEnv at bootstrap.',
          },
        ],
        'no-restricted-globals': [
          'error',
          {
            name: 'window',
            message:
              'DOM globals break React Native consumers; keep this module platform-neutral or add it to the web-only list.',
          },
          {
            name: 'document',
            message:
              'DOM globals break React Native consumers; keep this module platform-neutral or add it to the web-only list.',
          },
        ],
        // The @typescript-eslint variant understands `allowTypeImports` —
        // type-only imports are erased at compile time and never reach the
        // Metro/Hermes bundle.
        'no-restricted-imports': 'off',
        '@typescript-eslint/no-restricted-imports': [
          'error',
          {
            paths: WEB_ONLY_IMPORT_PATHS,
            patterns: WEB_ONLY_INTERNAL_PATTERNS,
          },
        ],
      },
    },
    {
      files: WEB_ONLY_FILES,
      rules: {
        'no-restricted-globals': 'off',
        'no-restricted-imports': 'off',
        '@typescript-eslint/no-restricted-imports': 'off',
      },
    },
  ],
});
