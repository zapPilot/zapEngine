import { execFileSync } from 'node:child_process';
import { accessSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const repo = 'zapPilot/zapEngine';
const run = (command, args) =>
  execFileSync(command, args, { cwd: root, encoding: 'utf8' });
const assert = (ok, message) => {
  if (!ok) throw new Error(message);
};
function release(endpoint) {
  try {
    return JSON.parse(run('gh', ['api', `repos/${repo}/${endpoint}`]));
  } catch (error) {
    if (/HTTP 404/.test(error.stderr?.toString() ?? '')) return undefined;
    throw error;
  }
}
export function publishDecision(existing, latest, candidate) {
  assert(!existing || existing.draft, 'Published release already exists');
  if (latest) {
    const match = /^desktop-v(\d+)\.(\d+)\.(\d+)$/.exec(latest.tag_name);
    assert(match, 'Latest must be a desktop release');
    const current = match.slice(1).map(BigInt),
      next = candidate.split('.').map(BigInt);
    const first = next.findIndex((value, i) => value !== current[i]);
    assert(
      first >= 0 && next[first] > current[first],
      'Release version must exceed Latest desktop release',
    );
  }
  return existing ? 'replace-draft' : 'create';
}
export function publish(tag, dir) {
  const version = JSON.parse(
    readFileSync(join(root, 'apps/desktop/package.json'), 'utf8'),
  ).version;
  assert(
    /^desktop-v\d+\.\d+\.\d+$/.test(tag ?? '') && tag === `desktop-v${version}`,
    'Tag must match desktop package version',
  );
  run('git', ['merge-base', '--is-ancestor', `${tag}^{commit}`, 'origin/main']);
  assert(
    run('git', ['rev-parse', `${tag}^{commit}`]).trim() ===
      run('git', ['rev-parse', 'HEAD']).trim(),
    'Checkout must match tag',
  );
  const paths = [
    'Zap-Pilot-mac-arm64.dmg',
    'Zap-Pilot-mac-arm64.dmg.blockmap',
    'Zap-Pilot-mac-arm64.zip',
    'Zap-Pilot-mac-arm64.zip.blockmap',
    'latest-mac.yml',
  ].map((name) => {
    const path = join(dir, name);
    accessSync(path);
    return path;
  });
  const existing = release(`releases/tags/${tag}`),
    latest = release('releases/latest');
  if (publishDecision(existing, latest, version) === 'replace-draft')
    run('gh', ['release', 'delete', tag, '--yes', '--repo', repo]);
  run('gh', [
    'release',
    'create',
    tag,
    '--draft',
    '--verify-tag',
    '--title',
    `Zap Pilot ${version}`,
    '--generate-notes',
    '--repo',
    repo,
    ...paths,
  ]);
  run('gh', [
    'release',
    'edit',
    tag,
    '--draft=false',
    '--latest',
    '--repo',
    repo,
  ]);
  assert(
    release('releases/latest')?.tag_name === tag,
    'Latest release did not advance',
  );
  const scratch = mkdtempSync(join(tmpdir(), 'zap-publish-'));
  try {
    run('gh', [
      'release',
      'download',
      tag,
      '--repo',
      repo,
      '--pattern',
      'latest-mac.yml',
      '--dir',
      scratch,
    ]);
    assert(
      readFileSync(join(scratch, 'latest-mac.yml'), 'utf8') ===
        readFileSync(join(dir, 'latest-mac.yml'), 'utf8'),
      'Published metadata mismatch',
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    assert(
      process.argv[3] === '--dir' && process.argv[4],
      'Expected <tag> --dir <directory>',
    );
    publish(process.argv[2], resolve(process.argv[4]));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
