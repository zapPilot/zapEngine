import { readFileSync } from 'node:fs';

const eas = JSON.parse(
  readFileSync(new URL('../eas.json', import.meta.url), 'utf8'),
);
const rootPackage = JSON.parse(
  readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'),
);
const nvmrc = readFileSync(
  new URL('../../../.nvmrc', import.meta.url),
  'utf8',
).trim();
const setupWorkspace = readFileSync(
  new URL(
    '../../../.github/actions/setup-workspace/action.yml',
    import.meta.url,
  ),
  'utf8',
);

// EAS runs `npm -g install pnpm@X` for every build, whether or not Corepack is
// enabled — enabling Corepack only adds a shim at $NVM_BIN/pnpm that the later
// global install then collides with (EEXIST). See expo/eas-cli#3148 and #3131,
// both still open. So the profile pin is what selects the pnpm version, and
// `corepack` must stay off.
const COREPACK_HELP =
  'must not enable corepack; EAS runs `npm -g install pnpm@X` regardless and ' +
  'the Corepack shim at $NVM_BIN/pnpm makes that install fail with EEXIST ' +
  '(expo/eas-cli#3148)';

const errors = [];
const packageManager = rootPackage.packageManager;
const pnpmMatch = /^pnpm@(\d+\.\d+\.\d+)$/.exec(packageManager ?? '');

if (!pnpmMatch) {
  errors.push('root package.json must pin pnpm via packageManager');
}
const expectedPnpm = pnpmMatch?.[1];

const expectedNodeMajor = nvmrc.replace(/^v/, '').split('.')[0];
if (!expectedNodeMajor) {
  errors.push('could not determine expected Node major from .nvmrc');
}
const profiles = ['preview', 'production'];

// Every build profile follows the same rule, named or not: pin pnpm to the
// root packageManager version, and leave Corepack disabled.
function checkProfile(profileName, profile) {
  if (profile.corepack === true) {
    errors.push(`build.${profileName} ${COREPACK_HELP}`);
  }

  if (!Object.hasOwn(profile, 'pnpm')) {
    errors.push(
      `build.${profileName} must pin pnpm; without it EAS resolves its own ` +
        'version, which drifts from the lockfile generation',
    );
  } else if (expectedPnpm && profile.pnpm !== expectedPnpm) {
    errors.push(
      `build.${profileName}.pnpm is ${profile.pnpm}, expected ${expectedPnpm} ` +
        'from root package.json packageManager',
    );
  }
}

for (const profileName of profiles) {
  const profile = eas.build?.[profileName];
  if (!profile) {
    errors.push(`eas.json is missing build.${profileName}`);
    continue;
  }

  checkProfile(profileName, profile);

  const nodeMajor = String(profile.node ?? '')
    .replace(/^v/, '')
    .split('.')[0];
  if (expectedNodeMajor && (!nodeMajor || nodeMajor !== expectedNodeMajor)) {
    errors.push(
      `build.${profileName}.node must use Node ${expectedNodeMajor}.x to match .nvmrc`,
    );
  }
}

for (const [profileName, profile] of Object.entries(eas.build ?? {})) {
  if (profiles.includes(profileName)) continue;
  if (profile && typeof profile === 'object') {
    checkProfile(profileName, profile);
  }
}

// CI never goes through EAS, so a pnpm version that drifts here would let the
// workspace gate pass on a version the release build never runs.
const actionMatch =
  /uses:\s*pnpm\/action-setup@[^\n]*\n(?:[^\n]*\n)*?\s+version:\s*(\S+)/.exec(
    setupWorkspace,
  );
if (!actionMatch) {
  errors.push(
    'setup-workspace action.yml: could not read the pnpm/action-setup version',
  );
} else if (expectedPnpm && actionMatch[1] !== expectedPnpm) {
  errors.push(
    `setup-workspace action.yml pins pnpm ${actionMatch[1]}, expected ` +
      `${expectedPnpm} from root package.json packageManager`,
  );
}

if (errors.length > 0) {
  console.error('EAS toolchain configuration is invalid:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(
  `EAS toolchain OK: Node ${expectedNodeMajor}.x, ${packageManager} in eas.json and CI`,
);
