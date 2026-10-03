import { readControlCenterConfig } from './config/env.js';
import { createOperationsService } from './services/operations/aggregate.js';

const issueId = process.argv[2];
if (!issueId || process.argv.length !== 3) {
  throw new Error(
    'ops:reconcile-sentry requires exactly one numeric issue ID.',
  );
}
const result = await createOperationsService({
  config: readControlCenterConfig(),
}).reconcileSentryIssue(issueId);
process.stdout.write(`${JSON.stringify(result)}\n`);
