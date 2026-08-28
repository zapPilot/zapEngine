import assert from 'node:assert/strict';
import test from 'node:test';

import { createLinePrefixer, parseOpsArgs } from './ops-lib.mjs';

test('parseOpsArgs starts the whole stack when no selector is given', () => {
  assert.deepEqual(parseOpsArgs([]), {
    dashboard: true,
    social: true,
    status: false,
    help: false,
    unknown: [],
  });
});

test('parseOpsArgs selects one child at a time', () => {
  assert.deepEqual(parseOpsArgs(['--dashboard']), {
    dashboard: true,
    social: false,
    status: false,
    help: false,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--social']), {
    dashboard: false,
    social: true,
    status: false,
    help: false,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--dashboard', '--social']), {
    dashboard: true,
    social: true,
    status: false,
    help: false,
    unknown: [],
  });
});

test('parseOpsArgs makes --status exclusive of every long-lived child', () => {
  assert.deepEqual(parseOpsArgs(['--status']), {
    dashboard: false,
    social: false,
    status: true,
    help: false,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--status', '--dashboard', '--social']), {
    dashboard: false,
    social: false,
    status: true,
    help: false,
    unknown: [],
  });
});

test('parseOpsArgs recognises both help spellings without defaulting', () => {
  for (const flag of ['-h', '--help']) {
    assert.deepEqual(parseOpsArgs([flag]), {
      dashboard: false,
      social: false,
      status: false,
      help: true,
      unknown: [],
    });
  }
});

test('parseOpsArgs collects unknown flags instead of ignoring them', () => {
  const parsed = parseOpsArgs(['--social', '--watch', 'extra']);
  assert.deepEqual(parsed.unknown, ['--watch', 'extra']);
  assert.equal(parsed.social, true);
});

test('createLinePrefixer prefixes a complete line', () => {
  const written = [];
  const push = createLinePrefixer('[social] ', (line) => written.push(line));

  push('publishing\n');

  assert.deepEqual(written, ['[social] publishing\n']);
});

test('createLinePrefixer joins a line split across chunk boundaries', () => {
  const written = [];
  const push = createLinePrefixer('[dashboard] ', (line) => written.push(line));

  push('listening on ');
  push('4000\nready\n');

  assert.deepEqual(written, [
    '[dashboard] listening on 4000\n',
    '[dashboard] ready\n',
  ]);
});

test('createLinePrefixer holds a trailing partial line until flush', () => {
  const written = [];
  const push = createLinePrefixer('[social] ', (line) => written.push(line));

  push('fatal: ');
  assert.deepEqual(written, []);

  push.flush();
  assert.deepEqual(written, ['[social] fatal: \n']);

  push.flush();
  assert.deepEqual(written, ['[social] fatal: \n']);
});
