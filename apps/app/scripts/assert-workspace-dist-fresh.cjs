// CommonJS on purpose: metro.config.js is CJS and cannot require an .mjs sibling.
const fs = require('node:fs');
const path = require('node:path');

// Workspace packages the app resolves through `dist` rather than source. A
// stale dist surfaces as "Unable to resolve module @zapengine/…" instead of
// anything pointing at the real cause.
const DIST_BACKED_PACKAGES = [
  'app-core',
  'types',
  'intent-engine',
  'design-tokens',
];

// Mirrors turbo.json `inputs`, which excludes generated sources from hashing.
const IGNORED_DIRS = new Set(['generated']);
const NON_EMITTING_SRC = /\.(d\.ts|test\.tsx?|spec\.tsx?)$/;

function listFiles(dir, relative = '') {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const files = [];
  for (const entry of entries) {
    const rel = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      files.push(...(listFiles(path.join(dir, entry.name), rel) ?? []));
      continue;
    }
    if (entry.isFile())
      files.push({ rel, absolute: path.join(dir, entry.name) });
  }
  return files;
}

function newestMtimeMs(files) {
  return files.reduce(
    (newest, file) => Math.max(newest, fs.statSync(file.absolute).mtimeMs),
    -1,
  );
}

// Turbo hashes content, not mtimes: `touch` and branch switches leave src newer
// than dist while a rebuild is genuinely a no-op. So only a *missing* emit is a
// hard failure — that is the case that breaks module resolution and the one a
// rebuild always fixes. Content drift downgrades to a warning.
function inspectPackage(packageDir) {
  const srcFiles = listFiles(path.join(packageDir, 'src'));
  if (srcFiles === null) return null;

  const distDir = path.join(packageDir, 'dist');
  const emitting = srcFiles.filter(
    (file) => /\.tsx?$/.test(file.rel) && !NON_EMITTING_SRC.test(file.rel),
  );
  const missingEmit = emitting.some(
    (file) =>
      !fs.existsSync(path.join(distDir, file.rel.replace(/\.tsx?$/, '.js'))),
  );

  return {
    missingEmit,
    contentDrift:
      newestMtimeMs(emitting) > newestMtimeMs(listFiles(distDir) ?? []),
  };
}

function rebuildCommand(names) {
  const filters = names.map((name) => `--filter=@zapengine/${name}`).join(' ');
  return `pnpm turbo run build ${filters}`;
}

function assertWorkspaceDistFresh(appRoot) {
  // CI builds through Turbo, which already orders `^build` before any bundle.
  if (process.env.CI || process.env.ZAP_SKIP_DIST_FRESHNESS_CHECK) return;

  const packagesRoot = path.resolve(appRoot, '..', '..', 'packages');
  const missing = [];
  const drifted = [];
  for (const name of DIST_BACKED_PACKAGES) {
    const result = inspectPackage(path.join(packagesRoot, name));
    if (result === null) continue;
    if (result.missingEmit) missing.push(name);
    else if (result.contentDrift) drifted.push(name);
  }

  if (missing.length > 0) {
    throw new Error(
      [
        '',
        'Workspace package output is missing files — Metro cannot resolve them:',
        ...missing.map((name) => `  packages/${name}/dist`),
        '',
        'Rebuild, then bundle again:',
        '',
        `  ${rebuildCommand(missing)}`,
        '',
        'Xcode\'s "Bundle React Native code and images" phase runs expo export:embed',
        'directly and never invokes Turbo, so packages/*/dist drifts behind src.',
        'Set ZAP_SKIP_DIST_FRESHNESS_CHECK=1 to bypass this check.',
        '',
      ].join('\n'),
    );
  }

  if (drifted.length > 0) {
    console.warn(
      `\n⚠️  Sources are newer than dist for ${drifted.join(', ')}. ` +
        `If the bundle looks out of date, run:\n  ${rebuildCommand(drifted)}\n`,
    );
  }
}

module.exports = assertWorkspaceDistFresh;
