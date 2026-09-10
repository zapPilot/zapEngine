import { readFile } from 'node:fs/promises';
import { fixSchema } from './services/operations/operator/observe.js';
import { readControlCenterConfig } from './config/env.js';
import { createOperationsService } from './services/operations/aggregate.js';
import { runOperatorCycle } from './services/operations/operator/runner.js';
import { createOperatorStore } from './services/operations/operator/store.js';

const config = readControlCenterConfig();
const store = createOperatorStore(config);
const fixPath = process.argv[process.argv.indexOf('--record-fix') + 1];
if (process.argv.includes('--record-fix')) {
  if (!fixPath) {
    throw new Error('--record-fix requires a JSON file.');
  }
  const fix = fixSchema.parse(JSON.parse(await readFile(fixPath, 'utf8')));
  await store.rpc('ops_register_fix', {
    p_incident: fix.incidentId,
    p_fix: fix,
  });
}
const result = await runOperatorCycle({
  operations: createOperationsService({ config }),
  store,
  config,
  actor: 'ops-operator-cli',
  mutationsEnabled: process.argv.includes('--allow-render-retry'),
});
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
