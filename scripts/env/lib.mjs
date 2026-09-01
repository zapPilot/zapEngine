import { readFileSync } from 'node:fs';

import { ENV_MANIFEST, LEGACY_ENV_NAMES } from '../../config/env.manifest.mjs';

const ASSIGNMENT =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/u;

function stripInlineComment(value) {
  let quote;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === '\\') {
      index += 1;
      continue;
    }
    if (quote) {
      if (character === quote) quote = undefined;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '#' && index > 0 && /\s/u.test(value[index - 1])) {
      return value.slice(0, index).trim();
    }
  }

  return value;
}

export function parseEnv(text) {
  const values = {};
  const duplicates = [];

  for (const sourceLine of text.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = ASSIGNMENT.exec(sourceLine);
    if (!match) continue;

    const key = match[1];
    let value = stripInlineComment((match[2] ?? '').trim());
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (Object.hasOwn(values, key)) duplicates.push(key);
    values[key] = value;
  }

  return { values, duplicates };
}

export function loadEnvFile(path) {
  try {
    return parseEnv(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return { values: {}, duplicates: [] };
    throw error;
  }
}

export function mergeEnv(fileValues, processValues = process.env) {
  const merged = { ...fileValues };
  for (const [key, value] of Object.entries(processValues)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

export function projectEnv(canonicalEnv, target) {
  const projected = {};
  const projectionKind =
    target === 'expo' ? 'expo' : target === 'landing-page' ? 'next' : 'vite';
  for (const [canonicalName, definition] of Object.entries(ENV_MANIFEST)) {
    const value = canonicalEnv[canonicalName];
    if (value === undefined) continue;
    if (definition.kind !== 'client') continue;
    if (!definition.targets.includes(target)) continue;

    const projectedName = definition.projections[projectionKind];
    if (projectedName) projected[projectedName] = value;
  }
  return projected;
}

export function projectAllClientEnv(canonicalEnv) {
  return Object.assign(
    {},
    projectEnv(canonicalEnv, 'web'),
    projectEnv(canonicalEnv, 'expo'),
    projectEnv(canonicalEnv, 'desktop'),
    projectEnv(canonicalEnv, 'landing-page'),
  );
}

export function validateEnv(env, { target, capability } = {}) {
  const errors = [];
  const warnings = [];
  const requirements = target
    ? new Set([
        `${target}:base`,
        ...(capability ? [`${target}:${capability}`] : []),
      ])
    : undefined;

  for (const legacyName of Object.keys(LEGACY_ENV_NAMES)) {
    if (Object.hasOwn(env, legacyName)) {
      errors.push(
        `${legacyName} is legacy; use ${LEGACY_ENV_NAMES[legacyName]}`,
      );
    }
  }

  for (const [name, definition] of Object.entries(ENV_MANIFEST)) {
    const matchedRequirement = definition.requiredFor.find((requiredFor) =>
      requirements?.has(requiredFor),
    );
    if (matchedRequirement && !env[name]?.trim()) {
      errors.push(`${name} is required for ${matchedRequirement}`);
    }
  }

  for (const name of Object.keys(env)) {
    if (/^(?:npm_|PNPM_|TURBO_)/u.test(name)) continue;
    if (Object.hasOwn(ENV_MANIFEST, name)) continue;
    if (
      [
        'CI',
        'PATH',
        'HOME',
        'USER',
        'PWD',
        'SHELL',
        'TERM',
        'TMPDIR',
        'PORT',
      ].includes(name)
    )
      continue;
    if (/^(?:VITE_|EXPO_PUBLIC_|NEXT_PUBLIC_)/u.test(name)) {
      warnings.push(
        `${name} is projected output and should not be human-maintained`,
      );
    }
  }

  return { errors, warnings };
}

const SENSITIVE_NAME =
  /(?:_KEY|_SECRET|_TOKEN|_PASSWORD|_CREDENTIALS?|PRIVATE_KEY|_DSN|DATABASE_URL)$/u;
const CREDENTIAL_VALUE =
  /^(?:eyJ|sk-|pk_|fly_|ghp_)[A-Za-z0-9_./+\-=]+$|^(?:[A-Fa-f0-9]{41,}|[A-Za-z0-9+/]{41,}={0,2})$/u;
const PUBLIC_EVM_ADDRESS_LIST =
  /^0x[A-Fa-f0-9]{40}(?:\s*,\s*0x[A-Fa-f0-9]{40})*$/u;

function isCredentialLikeValue(value) {
  return (
    !PUBLIC_EVM_ADDRESS_LIST.test(value) && CREDENTIAL_VALUE.test(value)
  );
}

export function auditSecretClassification(committedByEnvironment) {
  const errors = [];

  for (const [name, definition] of Object.entries(ENV_MANIFEST)) {
    if (
      SENSITIVE_NAME.test(name) &&
      !definition.sensitive &&
      !(definition.kind === 'host' && name.endsWith('_PATH'))
    ) {
      errors.push(`${name} looks sensitive but is classified sensitive: false`);
    }
  }

  for (const [environment, parsed] of Object.entries(committedByEnvironment)) {
    for (const duplicate of parsed.duplicates ?? []) {
      errors.push(`${environment}: ${duplicate} is declared more than once`);
    }
    for (const [name, value] of Object.entries(parsed.values ?? parsed)) {
      const definition = ENV_MANIFEST[name];
      if (!definition) {
        errors.push(`${environment}: ${name} is not declared in the manifest`);
        continue;
      }
      if (definition.kind === 'host') {
        errors.push(
          `${environment}: ${name} is host-managed and cannot be committed`,
        );
      }
      if (!definition.environments.includes(environment)) {
        errors.push(
          `${environment}: ${name} is not enabled in this environment`,
        );
      }
      if (definition.sensitive) {
        errors.push(
          `${environment}: ${name} is sensitive and cannot be committed`,
        );
      } else if (value && isCredentialLikeValue(value.trim())) {
        errors.push(
          `${environment}: ${name} has a credential-like committed value`,
        );
      }
    }
  }

  return errors;
}

export function validateProductionEnv(env) {
  const errors = [];
  const unsafeHost =
    /(?:localhost|127\.0\.0\.1|::1|host\.docker\.internal|\.local(?:[/:]|$))/iu;
  const placeholder = /(?:TODO|CHANGEME|your-)/iu;

  for (const [name, value] of Object.entries(env)) {
    if (!value) continue;
    const definition = ENV_MANIFEST[name];
    if (!definition || definition.kind === 'host') continue;
    if (unsafeHost.test(value))
      errors.push(`${name} contains a local-only host`);
    if (placeholder.test(value)) errors.push(`${name} contains a placeholder`);
    if (
      /(?:_URL|_GATEWAY|_ENDPOINT)$/u.test(name) &&
      value.startsWith('http://')
    ) {
      errors.push(`${name} must use https:// in production`);
    }
    if (
      definition.kind === 'server' &&
      /^(?:VITE_|EXPO_PUBLIC_|NEXT_PUBLIC_)/u.test(name)
    ) {
      errors.push(`${name} is a server value with a public projection prefix`);
    }
  }

  if (env.PLAN_SIMULATION_REQUIRED !== 'true') {
    errors.push('PLAN_SIMULATION_REQUIRED must be true in production');
  }

  return errors;
}
