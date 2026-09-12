import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const eas = JSON.parse(
  readFileSync(new URL('../eas.json', import.meta.url), 'utf8'),
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
);
const nvmrc = readFileSync(new URL('../../../.nvmrc', import.meta.url), 'utf8').trim();

const errors = [];
const packageManager = rootPackage.packageManager;
const pnpmMatch = /^pnpm@(.+)$/.exec(packageManager ?? '');

if (!pnpmMatch) {
  errors.push('root package.json must pin pnpm via packageManager');
}

const expectedNodeMajor = nvmrc.replace(/^v/, '').split('.')[0];
const profiles = ['preview', 'production'];

for (const profileName of profiles) {
  const profile = eas.build?.[profileName];
  if (!profile) {
    errors.push(`eas.json is missing build.${profileName}`);
    continue;
  }

  if (profile.corepack !== true) {
    errors.push(`build.${profileName}.corepack must be true`);
  }

  if (Object.hasOwn(profile, 'pnpm')) {
    errors.push(
      `build.${profileName} must not set pnpm when Corepack is enabled; ` +
        'root package.json packageManager is the pnpm version source of truth',
    );
  }

  const nodeMajor = String(profile.node ?? '').replace(/^v/, '').split('.')[0];
  if (!nodeMajor || nodeMajor !== expectedNodeMajor) {
    errors.push(
      `build.${profileName}.node must use Node ${expectedNodeMajor}.x to match .nvmrc`,
    );
  }
}

if (errors.length > 0) {
  console.error('EAS toolchain configuration is invalid:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `EAS toolchain OK: Node ${expectedNodeMajor}.x, Corepack, ${packageManager}`,
);
