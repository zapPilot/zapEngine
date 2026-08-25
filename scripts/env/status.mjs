#!/usr/bin/env node
import {
  DESTINATION_NAMES,
  ENV_DESTINATIONS,
} from '../../config/env.destinations.mjs';
import { ENV_MANIFEST, LEGACY_ENV_NAMES } from '../../config/env.manifest.mjs';
import { auditSecretClassification } from './lib.mjs';
import { listDestinationKeys } from './remote.mjs';
import { loadCommittedValues, loadInfisicalValues } from './sources.mjs';

const offline = process.argv.slice(2).includes('--offline');
const errors = [];

function report(scope, status, name, detail = '') {
  console.log(`${scope}: ${status}: ${name}${detail ? ` (${detail})` : ''}`);
}

function projectedName(name, definition, target) {
  if (definition.kind !== 'client') return name;
  if (target === 'expo' || target === 'web') {
    return definition.projections.expo;
  }
  if (target === 'landing-page') return definition.projections.next;
  if (target === 'desktop') return definition.projections.vite;
  return name;
}

function desiredFor(destination) {
  const sourceEnvironment =
    destination.sourceEnvironment ?? destination.environment;
  return Object.entries(ENV_MANIFEST)
    .filter(([, definition]) => definition.kind !== 'host')
    .filter(([, definition]) =>
      definition.environments.includes(sourceEnvironment),
    )
    .filter(([, definition]) => definition.targets.includes(destination.target))
    .map(([name, definition]) => ({
      canonical: name,
      name: projectedName(name, definition, destination.target),
      required: definition.requiredFor.some((requirement) =>
        requirement.startsWith(`${destination.target}:`),
      ),
    }))
    .filter(({ name }) => name);
}

const committed = {
  dev: loadCommittedValues('dev'),
  prod: loadCommittedValues('prod'),
};
for (const error of auditSecretClassification(committed)) {
  errors.push(error);
  report('sources', 'ERROR', error);
}

for (const environment of ['dev', 'prod']) {
  if (environment !== 'prod') continue;
  for (const [name, definition] of Object.entries(ENV_MANIFEST)) {
    if (
      definition.kind === 'host' ||
      !definition.environments.includes(environment) ||
      definition.sensitive ||
      !definition.requiredFor.length
    ) {
      continue;
    }
    if (!committed[environment].values[name]?.trim()) {
      const message = `${environment}/${name}`;
      errors.push(message);
      report('sources', 'MISSING_REQUIRED', message);
    }
  }
}

if (!offline) {
  for (const environment of ['dev', 'prod']) {
    let secrets;
    try {
      secrets = loadInfisicalValues(environment);
    } catch (error) {
      errors.push(error.message);
      report(`infisical/${environment}`, 'NOT_CHECKABLE', error.message);
      continue;
    }
    for (const name of Object.keys(secrets).sort()) {
      const definition = ENV_MANIFEST[name];
      if (!definition) {
        errors.push(`${environment}/${name}: unmanaged`);
        report(`infisical/${environment}`, 'UNMANAGED', name);
      } else if (!definition.sensitive || definition.kind === 'host') {
        errors.push(`${environment}/${name}: forbidden`);
        report(`infisical/${environment}`, 'FORBIDDEN', name);
      } else if (!definition.environments.includes(environment)) {
        errors.push(`${environment}/${name}: wrong environment`);
        report(`infisical/${environment}`, 'FORBIDDEN', name);
      }
    }
    for (const [name, definition] of Object.entries(ENV_MANIFEST)) {
      if (
        environment === 'prod' &&
        definition.sensitive &&
        definition.environments.includes(environment) &&
        definition.requiredFor.length > 0 &&
        !secrets[name]?.trim()
      ) {
        errors.push(`${environment}/${name}: missing required`);
        report(`infisical/${environment}`, 'MISSING_REQUIRED', name);
      }
    }
  }

  for (const destinationName of DESTINATION_NAMES) {
    const destination = ENV_DESTINATIONS[destinationName];
    let actual;
    try {
      actual = listDestinationKeys(destination);
    } catch (error) {
      errors.push(`${destinationName}: ${error.message}`);
      report(destinationName, 'NOT_CHECKABLE', error.message);
      continue;
    }
    const desired = desiredFor(destination);
    const desiredNames = new Set(desired.map(({ name }) => name));
    const managed = new Set(destination.managed);
    for (const { name, required } of desired) {
      if (required && !actual.has(name)) {
        errors.push(`${destinationName}/${name}: missing required`);
        report(destinationName, 'MISSING_REQUIRED', name);
      }
    }
    for (const name of [...actual].sort()) {
      if (desiredNames.has(name) || managed.has(name)) continue;
      const status =
        Object.hasOwn(ENV_MANIFEST, name) ||
        Object.hasOwn(LEGACY_ENV_NAMES, name) ||
        /^(?:VITE_|EXPO_PUBLIC_|NEXT_PUBLIC_)/u.test(name)
          ? 'FORBIDDEN'
          : 'UNMANAGED';
      errors.push(`${destinationName}/${name}: ${status.toLowerCase()}`);
      report(destinationName, status, name);
    }
  }
}

if (errors.length > 0) {
  console.error(`Environment status failed (${errors.length} issue(s)).`);
  process.exit(1);
}
console.log(
  `Environment status passed (${offline ? 'offline' : 'all destinations'}).`,
);
