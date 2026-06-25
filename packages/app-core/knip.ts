import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  // Library package: its public surface is the barrel files referenced by the
  // package `exports` map. Declare them as entries so knip does not report the
  // re-exported symbols as unused (they are consumed by other workspaces).
  entry: [
    'src/index.ts',
    'src/services/index.ts',
    'src/adapters/index.ts',
    'src/providers/index.ts',
    'src/utils/index.ts',
    'src/config/index.ts',
    'src/constants/index.ts',
    'src/schemas/index.ts',
    'src/types/index.ts',
    'src/regime/index.ts',
    'src/hooks/index.ts',
    'src/hooks/*/index.ts',
    'src/lib/*/index.ts',
  ],
  project: ['src/**/*.{ts,tsx}'],
  ignore: ['src/app-core-env.d.ts'],
  ignoreDependencies: ['@zapengine/design-tokens'],
});
