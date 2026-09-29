import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMainModule } from './is-main-module.js';

describe('isMainModule', () => {
  it('returns true when the invoked script matches the module url', () => {
    const invoked = process.argv[1];
    expect(invoked).toBeDefined();
    const expected = pathToFileURL(resolve(invoked!)).href;
    expect(isMainModule(expected)).toBe(true);
  });

  it('returns false when another script invoked the process', () => {
    expect(isMainModule('file:///definitely/not/the/invoked/file.mjs')).toBe(
      false,
    );
  });

  it('returns false when no script invoked the process', () => {
    const original = process.argv[1];
    process.argv.splice(1, 1);
    try {
      expect(process.argv[1]).toBeUndefined();
      expect(isMainModule('file:///any/module.mjs')).toBe(false);
    } finally {
      if (original !== undefined) process.argv.splice(1, 0, original);
    }
  });
});
