import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Vercel CLI deploys the supplied CI revision rather than the helper checkout', () => {
  const sha = '0123456789abcdef0123456789abcdef01234567';
  const mock = `
    import assert from 'node:assert/strict';
    globalThis.fetch = async (url, options) => {
      assert.equal(options.method, 'POST');
      const body = JSON.parse(options.body);
      assert.equal(body.gitSource.sha, '${sha}');
      return { ok: true, status: 200, text: async () => JSON.stringify({
        id: 'mock-deployment', readyState: 'READY'
      }) };
    };
  `;
  const result = spawnSync(
    process.execPath,
    [
      '--import',
      `data:text/javascript,${encodeURIComponent(mock)}`,
      new URL('../deploy-vercel-main.mjs', import.meta.url).pathname,
      sha,
    ],
    { encoding: 'utf8', env: { ...process.env, VERCEL_TOKEN: 'mock-token' } },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    (result.stdout.match(/production deployment READY/g) ?? []).length,
    3,
  );
});

test('Vercel executes trusted code and passes the tested revision only as deployment data', () => {
  const workflow = read('.github/workflows/deploy-vercel.yml');
  assert.ok(workflow.includes('ref: ${{ github.sha }}'));
  assert.ok(workflow.includes('persist-credentials: false'));
  assert.ok(
    !workflow.includes('ref: ${{ github.event.workflow_run.head_sha }}'),
  );
  assert.ok(
    workflow.includes('DEPLOY_SHA: ${{ github.event.workflow_run.head_sha }}'),
  );
  assert.ok(
    workflow.includes('node scripts/deploy-vercel-main.mjs "$DEPLOY_SHA"'),
  );
  const condition = workflow.match(/    if: >-\n([\s\S]*?)    runs-on:/)[1];
  const allowed = new Function('github', `return (${condition.trim()});`);
  const run = {
    conclusion: 'success',
    event: 'push',
    head_branch: 'main',
    head_repository: { full_name: 'zapPilot/zapEngine' },
  };
  const check = (overrides) =>
    allowed({
      repository: 'zapPilot/zapEngine',
      event: { workflow_run: { ...run, ...overrides } },
    });
  assert.equal(check({}), true);
  assert.equal(
    check({ head_repository: { full_name: 'outsider/fork' } }),
    false,
  );
  assert.equal(check({ event: 'pull_request' }), false);
  assert.equal(check({ head_branch: 'feature' }), false);
  assert.equal(check({ conclusion: 'failure' }), false);
});

test('Fly matrix selection reads only its named token and rejects unknown secret names', () => {
  const workflow = read('.github/workflows/ci.yml');
  assert.ok(!workflow.includes('secrets[matrix.secret_name]'));
  const expression = workflow.match(/fly_token: >-\s*\$\{\{([\s\S]*?)\}\}/)[1];
  const select = new Function(
    'matrix',
    'secrets',
    `return (${expression.trim()});`,
  );
  const registry = JSON.parse(read('.github/fly-apps.json'));
  for (const { secret_name: name } of registry) {
    const reads = [];
    const secrets = new Proxy(
      {},
      {
        get: (_, key) => {
          reads.push(key);
          return `token:${key}`;
        },
      },
    );
    assert.equal(select({ secret_name: name }, secrets), `token:${name}`);
    assert.deepEqual(reads, [name]);
  }
  for (const name of ['UNRELATED_SECRET', '', undefined]) {
    const secrets = new Proxy(
      {},
      {
        get: () => assert.fail('unknown matrix key must not access any secret'),
      },
    );
    assert.equal(select({ secret_name: name }, secrets), '');
  }
  assert.equal(select({ secret_name: registry[0].secret_name }, {}), '');
});
