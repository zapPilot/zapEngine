#!/usr/bin/env node
import {
  DESTINATION_NAMES,
  ENV_DESTINATIONS,
} from '../../config/env.destinations.mjs';
import { ENV_MANIFEST } from '../../config/env.manifest.mjs';
import { auditSecretClassification, validateProductionEnv } from './lib.mjs';
import {
  deleteEasKey,
  deleteVercelKey,
  importFlyValues,
  listDestinationKeys,
  setEasValue,
  setVercelValue,
  unsetFlyKeys,
} from './remote.mjs';
import { loadCommittedValues, resolveValues } from './sources.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const prune = args.includes('--prune');
const stageFly = args.includes('--stage-fly');
const targetIndex = args.indexOf('--target');
const target = targetIndex >= 0 ? args[targetIndex + 1] : undefined;

if (!target || !DESTINATION_NAMES.includes(target)) {
  console.error(
    `usage: pnpm env:sync --target ${DESTINATION_NAMES.join('|')} [--apply] [--prune] [--stage-fly]`,
  );
  process.exit(2);
}

const destination = ENV_DESTINATIONS[target];
if (stageFly && (!apply || destination.platform !== 'fly')) {
  console.error('error: --stage-fly requires --apply and a Fly destination');
  process.exit(2);
}

const environment = destination.sourceEnvironment ?? destination.environment;
const includedNames = destination.include
  ? new Set(destination.include)
  : undefined;
let values;
try {
  values = resolveValues(environment);
} catch (error) {
  console.error(`error: ${error.message}`);
  process.exit(1);
}
const classificationErrors = auditSecretClassification({
  dev: loadCommittedValues('dev'),
  prod: loadCommittedValues('prod'),
});
const safetyErrors =
  environment === 'prod' ? validateProductionEnv(values) : [];
const missingRequired = Object.entries(ENV_MANIFEST)
  .filter(([name]) => !includedNames || includedNames.has(name))
  .filter(([, definition]) => definition.kind !== 'host')
  .filter(([, definition]) => definition.targets.includes(destination.target))
  .filter(([, definition]) =>
    definition.requiredFor.some((requirement) =>
      requirement.startsWith(`${destination.target}:`),
    ),
  )
  .filter(([name]) => !values[name]?.trim())
  .map(([name]) => `${name} is required for ${destination.target}`);
for (const error of [
  ...classificationErrors,
  ...safetyErrors,
  ...missingRequired,
]) {
  console.error(`error: ${error}`);
}
if (
  classificationErrors.length + safetyErrors.length + missingRequired.length >
  0
) {
  process.exit(1);
}

const projectionKind = ['expo', 'web'].includes(destination.target)
  ? 'expo'
  : destination.target === 'landing-page'
    ? 'next'
    : destination.target === 'desktop'
      ? 'vite'
      : undefined;
const desired = Object.entries(ENV_MANIFEST)
  .filter(([canonical]) => !includedNames || includedNames.has(canonical))
  .filter(([, definition]) => definition.kind !== 'host')
  .filter(([, definition]) => definition.environments.includes(environment))
  .filter(([, definition]) => definition.targets.includes(destination.target))
  .map(([canonical, definition]) => ({
    canonical,
    definition,
    name:
      definition.kind === 'client' && projectionKind
        ? definition.projections[projectionKind]
        : canonical,
    value: values[canonical]?.trim(),
    required: definition.requiredFor.some((requirement) =>
      requirement.startsWith(`${destination.target}:`),
    ),
  }))
  .filter(({ name, value }) => name && value);

let actual;
try {
  actual = listDestinationKeys(destination);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
const selected = desired;
const desiredNames = new Set(desired.map(({ name }) => name));
const managed = new Set(destination.managed);
const forbidden = [...actual]
  .filter((name) => !desiredNames.has(name) && !managed.has(name))
  .sort();

console.log(`${apply ? (stageFly ? 'Stage' : 'Apply') : 'Dry run'} ${target}:`);
for (const { name } of selected.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  SET ${name}`);
}
if (prune) {
  for (const name of forbidden) console.log(`  UNSET ${name}`);
}
if (!apply) {
  console.log('No remote state changed. Re-run with --apply to sync.');
  process.exit(0);
}

const selectedValues = Object.fromEntries(
  selected.map(({ name, value }) => [name, value]),
);
if (destination.platform === 'fly') {
  importFlyValues(destination, selectedValues, { stage: stageFly });
  if (prune) unsetFlyKeys(destination, forbidden, { stage: stageFly });
} else if (destination.platform === 'eas') {
  for (const { name, value, definition } of selected) {
    setEasValue(destination, name, value, definition.sensitive);
  }
  if (prune) for (const name of forbidden) deleteEasKey(destination, name);
} else if (destination.platform === 'vercel') {
  for (const { name, value, definition } of selected) {
    setVercelValue(destination, name, value, definition.sensitive);
  }
  if (prune) for (const name of forbidden) deleteVercelKey(destination, name);
}
console.log(
  `${stageFly ? 'Environment staged' : 'Environment sync completed'} for ${target}.`,
);
