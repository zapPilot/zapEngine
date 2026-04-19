import { createReactViteConfig } from '@zapengine/eslint-config/react-vite';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const eslintProjectConfig = join(__dirname, 'tsconfig.eslint.json');

export default createReactViteConfig({
  tsconfigPath: eslintProjectConfig,
  tsconfigRootDir: __dirname,
});
