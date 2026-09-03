import { describe, expect, it } from 'vitest';

import { parseFlagArgs } from './cli-args.js';

describe('parseFlagArgs', () => {
  it('returns a null command and no flags for an empty argv', () => {
    expect(parseFlagArgs([])).toEqual({
      command: null,
      flags: {},
      positionals: [],
    });
  });

  it('treats the first token as the command', () => {
    expect(parseFlagArgs(['export'])).toEqual({
      command: 'export',
      flags: {},
      positionals: [],
    });
  });

  it('pairs a --flag with the following non-flag value', () => {
    expect(
      parseFlagArgs(['export', '--status', 'open', '--limit', '5']),
    ).toEqual({
      command: 'export',
      flags: { status: 'open', limit: '5' },
      positionals: [],
    });
  });

  it('treats a --flag followed by another flag or nothing as boolean true', () => {
    expect(parseFlagArgs(['run', '--dry-run', '--verbose'])).toEqual({
      command: 'run',
      flags: { 'dry-run': true, verbose: true },
      positionals: [],
    });
  });

  it('collects non-flag tokens after the command as positionals', () => {
    expect(
      parseFlagArgs(['resolve', 'first', '--id', 'abc', 'second']),
    ).toEqual({
      command: 'resolve',
      flags: { id: 'abc' },
      positionals: ['first', 'second'],
    });
  });
});
