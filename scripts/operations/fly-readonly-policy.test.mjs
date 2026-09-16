import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { allowedRequest, projectTools } from './fly-readonly-policy.mjs';
const call = (name, args = {}) => ({
  method: 'tools/call',
  params: { name, arguments: args },
});
test('rejects mutations, new tools, extra arguments and executable input', () => {
  for (const name of [
    'fly-machine-destroy',
    'fly-secrets-set',
    'fly-machine-exec',
    'fly-future-write',
    '__proto__',
  ])
    assert.equal(allowedRequest(call(name)), false);
  assert.equal(
    allowedRequest(
      call('fly-machine-status', { id: '123', 'display-config': true }),
    ),
    false,
  );
  assert.equal(allowedRequest(call('fly-status', { app: '--help' })), false);
  assert.equal(allowedRequest(call('fly-status', { app: 'app; rm' })), false);
  assert.equal(allowedRequest({ method: 'resources/read' }), false);
  assert.equal(allowedRequest(null), false);
});
test('admits only audited reads and hides write tools from discovery', () => {
  assert.equal(
    allowedRequest(call('fly-status', { app: 'account-engine' })),
    true,
  );
  assert.equal(allowedRequest({ method: 'initialize' }), true);
  const tool = (name) => ({
    name,
    inputSchema: { properties: { app: {}, 'display-config': {} } },
  });
  const result = projectTools({
    tools: [tool('fly-status'), tool('fly-machine-destroy')],
  });
  assert.deepEqual(
    result.tools.map((t) => t.name),
    ['fly-status'],
  );
  assert.deepEqual(Object.keys(result.tools[0].inputSchema.properties), [
    'app',
  ]);
  assert.equal(result.tools[0].annotations.readOnlyHint, true);
});
