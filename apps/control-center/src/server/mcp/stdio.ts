import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { readControlCenterConfig } from '../config/env.js';
import { createOperationsService } from '../services/operations/aggregate.js';
import { createOpsMcpServer } from './server.js';

const operations = createOperationsService({
  config: readControlCenterConfig(),
});

void serveStdio(() => createOpsMcpServer(operations));
