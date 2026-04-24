import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

const REPO_ROOT_ENV = path.resolve(__dirname, '../../../.env');
loadDotenv({ path: REPO_ROOT_ENV });

import { bootstrap } from './app';

export { bootstrap };

if (process.env['NODE_ENV'] !== 'test') {
  bootstrap();
}
