// Pure iOS App Version model. Apple's state (App Store versions and TestFlight
// trains) is the source of truth, never EAS build history: a failed, cancelled
// or build-only EAS build does not change what Apple has closed, so every
// policy gives the same answer when a release is re-run.

export const IOS_VERSION_POLICIES = ['auto', 'keep', 'bump-patch'];

// Explicit allowlist. Anything else (including a state this file has never
// seen) is treated as closed: a wrong "closed" costs one extra patch number, a
// wrong "open" burns an EAS build and then fails upload with ITMS-90186.
export const OPEN_VERSION_STATES = new Set([
  'PREPARE_FOR_SUBMISSION',
  'READY_FOR_REVIEW',
  'WAITING_FOR_REVIEW',
  'IN_REVIEW',
  'DEVELOPER_REJECTED',
  'REJECTED',
  'METADATA_REJECTED',
  'INVALID_BINARY',
]);

const IN_REVIEW_STATES = new Set(['WAITING_FOR_REVIEW', 'IN_REVIEW']);
const VERSION_PATTERN = /^\d+(\.\d+){0,2}$/u;
const COMMITTED_VERSION_LINE = /^ {2}version: '([^']*)',$/gmu;

export function parseVersion(raw) {
  const text = String(raw ?? '').trim();

  if (!VERSION_PATTERN.test(text)) {
    throw new Error(
      `Unsupported app version "${text}". Expected 1-3 numeric segments such as 3.0.1.`,
    );
  }

  const [major, minor = 0, patch = 0] = text.split('.').map(Number);

  if (![major, minor, patch].every(Number.isSafeInteger)) {
    throw new Error(`App version "${text}" is out of range.`);
  }

  return [major, minor, patch];
}

export function compareVersions(left, right) {
  const a = parseVersion(left);
  const b = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] - b[index];
    }
  }

  return 0;
}

export function bumpPatch(version) {
  const [major, minor, patch] = parseVersion(version);

  return `${major}.${minor}.${patch + 1}`;
}

/** `true` when Apple still accepts new builds for a version in this state. */
export function isOpenState(state) {
  return OPEN_VERSION_STATES.has(state);
}

function highest(versions) {
  return versions.reduce(
    (best, candidate) =>
      best === undefined || compareVersions(candidate.version, best.version) > 0
        ? candidate
        : best,
    undefined,
  );
}

/**
 * @param {{
 *   policy: string,
 *   committed: string,
 *   storeVersions: { version: string, state: string }[],
 *   trainVersions: string[],
 * }} input
 */
export function resolveIosAppVersion({
  policy,
  committed,
  storeVersions,
  trainVersions,
}) {
  if (!IOS_VERSION_POLICIES.includes(policy)) {
    throw new Error(
      `Unknown ios_version_policy "${policy}". Expected ${IOS_VERSION_POLICIES.join(' | ')}.`,
    );
  }

  const warnings = [];
  const known = [
    { version: committed, state: undefined },
    ...trainVersions.map((version) => ({ version, state: undefined })),
    ...storeVersions.map(({ version, state }) => ({ version, state })),
  ];
  // Equal numeric versions keep the string Apple already knows, so `3.1` is not
  // re-spelled `3.1.0` and does not open a second train.
  const ordered = [...known].sort(
    (a, b) => (b.state === undefined ? 0 : 1) - (a.state === undefined ? 0 : 1),
  );
  const currentEntry = highest(ordered);
  const current = currentEntry.version;

  for (const { version, state } of storeVersions) {
    if (state && !OPEN_VERSION_STATES.has(state) && !KNOWN_CLOSED.has(state)) {
      warnings.push(
        `Unrecognised App Store version state ${state} for ${version}; treating it as closed.`,
      );
    }
  }

  // `current` is the highest version Apple knows about, so it is closed exactly
  // when it is itself an approved version; everything below it is already
  // behind it.
  const currentStore = storeVersions
    .filter(({ version }) => compareVersions(version, current) === 0)
    .at(-1);
  const closed = currentStore ? !isOpenState(currentStore.state) : false;
  const currentState = currentStore?.state;

  if (policy === 'keep' && closed) {
    throw new Error(
      `ios_version_policy=keep cannot build ${current}: Apple has closed it ` +
        `(${currentState}). Re-run with ios_version_policy=auto or bump-patch.`,
    );
  }

  const version =
    policy === 'bump-patch' || (policy === 'auto' && closed)
      ? bumpPatch(current)
      : current;
  const resolvedStore = storeVersions.find(
    (entry) => compareVersions(entry.version, version) === 0,
  );

  if (resolvedStore && IN_REVIEW_STATES.has(resolvedStore.state)) {
    warnings.push(
      `Version ${version} is ${resolvedStore.state}. If Apple approves it while ` +
        'this build runs, the upload will be rejected (ITMS-90186).',
    );
  }

  return {
    policy,
    committed,
    current,
    currentState: currentState ?? (closed ? 'CLOSED' : 'OPEN'),
    closed,
    version,
    warnings,
  };
}

// States Apple documents for a version that no longer accepts builds. Only used
// to keep the unknown-state warning quiet for the ordinary approved lifecycle.
const KNOWN_CLOSED = new Set([
  'READY_FOR_DISTRIBUTION',
  'READY_FOR_SALE',
  'PENDING_APPLE_RELEASE',
  'PENDING_DEVELOPER_RELEASE',
  'PROCESSING_FOR_DISTRIBUTION',
  'PROCESSING_FOR_APP_STORE',
  'REPLACED_WITH_NEW_VERSION',
  'REMOVED_FROM_SALE',
  'DEVELOPER_REMOVED_FROM_SALE',
  'PREORDER_READY_FOR_SALE',
  'ACCEPTED',
  'APPROVED',
  'NOT_APPLICABLE',
]);

export function readCommittedAppVersion(source) {
  const matches = [...source.matchAll(COMMITTED_VERSION_LINE)];

  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one top-level "  version: '<x.y.z>'," line in app.config.ts, found ${matches.length}.`,
    );
  }

  parseVersion(matches[0][1]);

  return matches[0][1];
}

export function pinCommittedAppVersion(source, version) {
  parseVersion(version);
  readCommittedAppVersion(source);

  return source.replace(
    COMMITTED_VERSION_LINE,
    () => `  version: '${version}',`,
  );
}
