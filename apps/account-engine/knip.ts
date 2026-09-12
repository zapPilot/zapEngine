import { defineKnipConfig } from '@zapengine/knip-config/base';

export default defineKnipConfig({
  project: ['src/**/*.ts'],
  ignore: ['src/types/database.types.ts'],
  // Imported bare from src/modules/plan-orchestration/*, but the package's
  // `exports` map targets `dist/`, so knip resolves those imports outside this
  // workspace and never credits the direct dependency.
  ignoreDependencies: ['@zapengine/intent-engine'],
  includeEntryExports: true,
  vitest: { config: ['vitest.config.ts'] },
});
