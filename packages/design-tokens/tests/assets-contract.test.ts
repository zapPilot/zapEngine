import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { packageRoot } from '../src/paths.js';
import { loadTokens } from '../src/tokens.js';

function table(bytes: Buffer, tag: string): Buffer | undefined {
  for (let i = 0; i < bytes.readUInt16BE(4); i++) {
    const offset = 12 + i * 16;
    if (bytes.toString('ascii', offset, offset + 4) === tag) {
      const start = bytes.readUInt32BE(offset + 8);
      return bytes.subarray(start, start + bytes.readUInt32BE(offset + 12));
    }
  }
}
function names(bytes: Buffer, id: number): string[] {
  const name = table(bytes, 'name')!;
  const strings = name.readUInt16BE(4);
  const result: string[] = [];
  for (let i = 0; i < name.readUInt16BE(2); i++) {
    const offset = 6 + i * 12;
    if (name.readUInt16BE(offset + 6) !== id) continue;
    const value = name.subarray(
      strings + name.readUInt16BE(offset + 10),
      strings + name.readUInt16BE(offset + 10) + name.readUInt16BE(offset + 8),
    );
    result.push(
      name.readUInt16BE(offset) === 3
        ? value.swap16().toString('utf16le')
        : value.toString('ascii'),
    );
  }
  return result;
}
it('ships ten hash-verified static instances with the exact registered family and axes', () => {
  const tokens = loadTokens();
  const manifest = JSON.parse(
    readFileSync(join(packageRoot, 'fonts/static/manifest.json'), 'utf8'),
  );
  expect(Object.keys(manifest.fonts)).toEqual(Object.keys(tokens.font.native));
  for (const [key, spec] of Object.entries(tokens.font.native)) {
    const bytes = readFileSync(join(packageRoot, 'fonts/static', spec.file));
    expect(manifest.fonts[key]).toMatchObject(spec);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      manifest.fonts[key].sha256,
    );
    expect(names(bytes, 1)).toContain(spec.family);
    expect(names(bytes, 16)).toContain(spec.family);
    expect(table(bytes, 'fvar')).toBeUndefined();
    expect(table(bytes, 'OS/2')!.readUInt16BE(4)).toBe(spec.weight);
  }
  for (const role of Object.values(tokens.type)) {
    const native = tokens.font.native[role.native];
    expect(native.weight).toBe(role.weight);
    expect(native.width).toBe(role.width);
  }
});
it('regenerates every host brand copy byte for byte', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zap-brand-drift-'));
  try {
    execFileSync(process.execPath, [
      join(packageRoot, 'scripts/brand.mjs'),
      directory,
    ]);
    const outputs: string[] = JSON.parse(
      readFileSync(join(packageRoot, 'brand/outputs.json'), 'utf8'),
    );
    expect(outputs.length).toBe(25);
    for (const output of outputs) {
      expect(readFileSync(join(directory, output)), output).toEqual(
        readFileSync(join(packageRoot, '../..', output)),
      );
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}, 60_000);
