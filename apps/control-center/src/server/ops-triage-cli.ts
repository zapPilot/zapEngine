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
if (
  /^github-security:(?:code-scanning|secret-scanning)\/repository$/.test(
    record.fingerprint,
  ) &&
  !/^\d+$/.test(record.assessment.target)
) {
  throw new Error('GitHub Security triage requires an exact numeric alert ID.');
}
if (
  record.fingerprint === 'github-security:dependabot/repository' &&
  (!/^[^:\s,]+\.(?:ya?ml|json|toml|txt|lock|in)$/.test(
    record.assessment.target,
  ) ||
    record.assessment.target.includes('..'))
) {
  throw new Error('Dependabot triage requires a manifest path.');
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
