import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { createNextConfig } from '@zapengine/eslint-config/next';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default createNextConfig({
  tsconfigRootDir: __dirname,
});
