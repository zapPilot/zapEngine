import { readFileSync, writeFileSync } from 'node:fs';

import { ENV_MANIFEST, LEGACY_ENV_NAMES } from '../../config/env.manifest.mjs';

const ASSIGNMENT =
  /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)?\s*$/u;

export function parseEnv(text) {
  const values = {};
  const duplicates = [];

  for (const sourceLine of text.split(/\r?\n/u)) {
    const line = sourceLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = ASSIGNMENT.exec(sourceLine);
    if (!match) continue;

    const key = match[1];
    let value = (match[2] ?? '').trim();
    if (
      !(
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      )
    ) {
      value = value.replace(/\s+#.*$/u, '').trim();
    }
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

export function migrateEnvFile(path) {
  const source = readFileSync(path, 'utf8');
  const parsed = parseEnv(source);
  const existingCanonical = new Set(
    source
      .split(/\r?\n/u)
      .map((line) => ASSIGNMENT.exec(line)?.[1])
      .filter((name) => name && !Object.hasOwn(LEGACY_ENV_NAMES, name)),
  );
  const legacyCanonicalValues = new Map();

  for (const [legacyName, canonicalName] of Object.entries(LEGACY_ENV_NAMES)) {
    if (!Object.hasOwn(parsed.values, legacyName)) continue;
    if (existingCanonical.has(canonicalName)) continue;

    const value = parsed.values[legacyName];
    const previous = legacyCanonicalValues.get(canonicalName);
    if (previous && previous.value !== value) {
      throw new Error(
        `Conflicting legacy values for ${canonicalName}: ${previous.name} and ${legacyName}`,
      );
    }
    legacyCanonicalValues.set(canonicalName, { name: legacyName, value });
  }

  const seenCanonical = new Set();
  const output = [];

  for (const line of source.split(/\r?\n/u)) {
    const match = ASSIGNMENT.exec(line);
    if (!match) {
      output.push(line);
      continue;
    }

    const oldName = match[1];
    const canonicalName = LEGACY_ENV_NAMES[oldName] ?? oldName;
    if (oldName !== canonicalName && existingCanonical.has(canonicalName)) {
      continue;
    }
    if (seenCanonical.has(canonicalName)) continue;
    seenCanonical.add(canonicalName);
    output.push(
      oldName === canonicalName ? line : line.replace(oldName, canonicalName),
    );
  }

  writeFileSync(path, output.join('\n'));
}
