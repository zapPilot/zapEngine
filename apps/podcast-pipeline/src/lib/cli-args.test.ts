import { describe, expect, it } from 'vitest';

import { assertOnlyKnownFlags, parseFlagArgs } from './cli-args.js';

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

describe('assertOnlyKnownFlags', () => {
  const USAGE = 'Usage: example --foo <value>';

  it('passes through a parse with only allowed flags and no positionals', () => {
    const parsed = parseFlagArgs(['example', '--foo', 'bar']);
    expect(() => assertOnlyKnownFlags(parsed, ['foo'], USAGE)).not.toThrow();
  });

  it('throws the usage message when a stray positional is present', () => {
    const parsed = parseFlagArgs(['example', 'stray', '--foo', 'bar']);
    expect(() => assertOnlyKnownFlags(parsed, ['foo'], USAGE)).toThrow(USAGE);
  });

  it('throws Unknown option for a flag outside the allowed list', () => {
    const parsed = parseFlagArgs(['example', '--foo', 'bar', '--baz', 'qux']);
    expect(() => assertOnlyKnownFlags(parsed, ['foo'], USAGE)).toThrow(
      'Unknown option: --baz',
    );
  });
});
