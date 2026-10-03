import { readFile } from 'node:fs/promises';
import { opsTriageRecordSchema } from '@zapengine/types/shared';
import { readControlCenterConfig } from './config/env.js';
import { createOperatorStore } from './services/operations/operator/store.js';

const path = process.argv[2];
if (!path || process.argv.length !== 3) {
  throw new Error(
    'ops:triage requires exactly one assessment JSON file. It never runs an operator cycle.',
  );
}
const record = opsTriageRecordSchema.parse(
  JSON.parse(await readFile(path, 'utf8')),
);
if (
  /^sentry:(?:issues|stale-unresolved)\//.test(record.fingerprint) &&
  !/^\d+$/.test(record.assessment.target)
) {
  throw new Error('Sentry triage requires an exact issue ID.');
}
const incidentId = await createOperatorStore(readControlCenterConfig()).rpc(
  'ops_record_triage',
  {
    p_fingerprint: record.fingerprint,
    p_actor: record.actor,
    p_assessment: record.assessment,
  },
);
process.stdout.write(`${JSON.stringify({ incidentId, record })}\n`);
