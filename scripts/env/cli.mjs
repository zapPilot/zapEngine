#!/usr/bin/env node
import { ENV_MANIFEST, ENV_TARGETS } from '../../config/env.manifest.mjs';
import { projectEnv } from './lib.mjs';
import { resolveValues } from './sources.mjs';

const [command, ...args] = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const target = option('--target');
const environment = option('--environment', 'dev');

if (target && !ENV_TARGETS.includes(target)) {
  console.error(
    `Unknown target ${target}. Expected one of: ${ENV_TARGETS.join(', ')}`,
  );
  process.exit(2);
}
if (!['dev', 'prod'].includes(environment)) {
  console.error('Unknown environment. Expected dev or prod.');
  process.exit(2);
}

if (command === 'keys') {
  for (const name of Object.keys(ENV_MANIFEST).sort()) console.log(name);
  process.exit(0);
}

if (command === 'mappings') {
  for (const [name, definition] of Object.entries(ENV_MANIFEST)) {
    console.log(
      [name, definition.kind, ...Object.values(definition.projections)].join(
        '|',
      ),
    );
  }
  process.exit(0);
}

if (command === 'show') {
  let env;
  try {
    env = resolveValues(environment);
  } catch (error) {
    console.error(`error: ${error.message}`);
    process.exit(1);
  }
  const definitions = Object.entries(ENV_MANIFEST).filter(
    ([, definition]) =>
      definition.environments.includes(environment) &&
      (!target || definition.targets.includes(target)),
  );
  for (const [name, definition] of definitions) {
    const value = env[name];
    const display =
      value === undefined || value === ''
        ? '<unset>'
        : definition.sensitive
          ? '<redacted>'
          : value;
    console.log(`${name}=${display}`);
  }
  if (target && ['web', 'expo', 'desktop', 'landing-page'].includes(target)) {
    console.log('\nProjected names:');
    for (const [name, value] of Object.entries(
      projectEnv(env, target),
    ).sort()) {
      const canonical = Object.entries(ENV_MANIFEST).find(([, definition]) =>
        Object.values(definition.projections).includes(name),
      );
      console.log(
        `${name}=${canonical?.[1].sensitive ? '<redacted>' : value || '<unset>'}`,
      );
    }
  }
  process.exit(0);
}

console.error(
  'usage: node scripts/env/cli.mjs <keys|mappings|show> [--environment dev|prod] [--target name]',
);
process.exit(2);
