// @ts-check
import { createBackendVitestConfig } from '@zapengine/eslint-config/backend-vitest';

export default createBackendVitestConfig({
  tsconfigRootDir: import.meta.dirname,
});
