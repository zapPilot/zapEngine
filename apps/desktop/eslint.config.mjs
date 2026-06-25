// @ts-check
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default createReactViteConfig({
  tsconfigPath: join(__dirname, 'tsconfig.eslint.json'),
  tsconfigRootDir: __dirname,
});
