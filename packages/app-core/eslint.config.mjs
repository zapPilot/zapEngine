// @ts-check
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default createReactViteConfig({
  tsconfigPath: join(__dirname, 'tsconfig.eslint.json'),
  tsconfigRootDir: __dirname,
});
