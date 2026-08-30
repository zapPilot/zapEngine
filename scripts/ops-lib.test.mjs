import assert from 'node:assert/strict';
import test from 'node:test';

import { createLinePrefixer, parseOpsArgs } from './ops-lib.mjs';

test('parseOpsArgs starts the whole stack when no selector is given', () => {
  assert.deepEqual(parseOpsArgs([]), {
    dashboard: true,
    social: true,
    status: false,
    json: false,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
});

test('parseOpsArgs selects one child at a time', () => {
  assert.deepEqual(parseOpsArgs(['--dashboard']), {
    dashboard: true,
    social: false,
    status: false,
    json: false,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--social']), {
    dashboard: false,
    social: true,
    status: false,
    json: false,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--dashboard', '--social']), {
    dashboard: true,
    social: true,
    status: false,
    json: false,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
});

test('parseOpsArgs makes --status exclusive of every long-lived child', () => {
  assert.deepEqual(parseOpsArgs(['--status']), {
    dashboard: false,
    social: false,
    status: true,
    json: false,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--status', '--dashboard', '--social']), {
    dashboard: false,
    social: false,
    status: true,
    json: false,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
});

test('parseOpsArgs forwards the status tool flags alongside --status', () => {
  assert.deepEqual(parseOpsArgs(['--status', '--json']), {
    dashboard: false,
    social: false,
    status: true,
    json: true,
    force: false,
    help: false,
    error: null,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--status', '--force']), {
    dashboard: false,
    social: false,
    status: true,
    json: false,
    force: true,
    help: false,
    error: null,
    unknown: [],
  });
  assert.deepEqual(parseOpsArgs(['--status', '--json', '--force']), {
    dashboard: false,
    social: false,
    status: true,
    json: true,
    force: true,
    help: false,
    error: null,
    unknown: [],
  });
});

test('parseOpsArgs rejects the status tool flags without --status', () => {
  for (const flag of ['--json', '--force']) {
    const parsed = parseOpsArgs([flag]);
    assert.match(parsed.error, /--status/);
    assert.deepEqual(parsed.unknown, []);
  }
});

test('parseOpsArgs rejects the status tool flags next to a named child', () => {
  assert.match(
    parseOpsArgs(['--json', '--dashboard']).error,
    /--json cannot be combined with --dashboard/,
  );
  assert.match(
    parseOpsArgs(['--status', '--force', '--social']).error,
    /--force cannot be combined with --social/,
  );
});

test('parseOpsArgs recognises both help spellings without defaulting', () => {
  for (const flag of ['-h', '--help']) {
    assert.deepEqual(parseOpsArgs([flag]), {
      dashboard: false,
      social: false,
      status: false,
      json: false,
      force: false,
      help: true,
      error: null,
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
