// @ts-check
import { createBackendJestConfig } from '@zapengine/eslint-config/backend-jest';

export default createBackendJestConfig({
  tsconfigRootDir: import.meta.dirname,
});
