import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import dotenv from 'dotenv';

import { readControlCenterConfig } from './config/env.js';
import { createOverviewService } from './services/overview.js';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  '..',
);
dotenv.config({ path: resolve(repoRoot, '.env') });

const service = createOverviewService({ config: readControlCenterConfig() });
console.log(JSON.stringify(await service.getOverview(true), null, 2));
