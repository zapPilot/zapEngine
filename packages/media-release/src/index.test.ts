import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  artifactSchema,
  canonicalJson,
  fingerprintOf,
  manifestSchema,
  newReleaseId,
  planPublish,
  readSidecar,
  readSourceCommit,
  sha256File,
  sidecarSchema,
  verifyPublicArtifact,
  writeJsonAtomic,
  writeSidecar,
  type Artifact,
} from './index.js';
const bytes = Buffer.from('hello');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const sidecar = {
  fingerprint: 'a'.repeat(64),
  sha256,
  bytes: 5,
  renderedAt: '2026-10-05T00:00:00.000Z',
  sourceCommit: 'a'.repeat(40),
};
const artifact: Artifact = {
  ...sidecar,
  url: 'https://example.com/file',
  contentType: 'video/mp4',
};
describe('canonical fingerprints', () => {
  it('sorts objects recursively and preserves array order', () => {
    expect(
      canonicalJson({ z: [null, true, 2, { b: 'x', a: false }], a: {} }),
    ).toBe('{"a":{},"z":[null,true,2,{"a":false,"b":"x"}]}');
    expect(fingerprintOf({ b: 1, a: 2 })).toBe(fingerprintOf({ a: 2, b: 1 }));
    expect(fingerprintOf([1, 2])).not.toBe(fingerprintOf([2, 1]));
  });
  it.each([
    undefined,
    () => 1,
    Infinity,
    -Infinity,
    NaN,
    new Date(),
    Symbol('x'),
    1n,
  ])('rejects non JSON values', (value) => {
    expect(() => canonicalJson(value)).toThrow('plain JSON');
  });
});
it('reads hashes, commits, sidecars and atomically replaces JSON', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'media-release-'));
  try {
    const file = path.join(dir, 'file');
    await writeFile(file, bytes);
    expect(await sha256File(file)).toBe(sha256);
    await writeSidecar(`${file}.json`, { ...sidecar, durationSeconds: 2 });
    expect(await readSidecar(`${file}.json`)).toEqual({
      ...sidecar,
      durationSeconds: 2,
    });
    await writeJsonAtomic(`${file}.json`, { replacement: true });
    expect(await readFile(`${file}.json`, 'utf8')).toBe(
      '{\n  "replacement": true\n}\n',
    );
    await expect(
      writeJsonAtomic(path.join(dir, 'missing', 'file'), {}),
    ).rejects.toThrow();
    await expect(
      writeSidecar(`${file}.json`, { ...sidecar, bytes: 0 }),
    ).rejects.toThrow();
    await expect(readSidecar(`${file}.json`)).rejects.toThrow();
    expect(readSourceCommit(import.meta.dirname)).toMatch(/^[a-f0-9]{40}$/);
    expect(newReleaseId(new Date('2026-10-05T03:04:05Z'), '12345678')).toBe(
      '20261005-030405-12345678',
    );
    expect(newReleaseId()).toMatch(/^\d{8}-\d{6}-[a-f0-9]{8}$/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
it('validates wire metadata', () => {
  expect(sidecarSchema.parse(sidecar)).toEqual(sidecar);
  expect(artifactSchema.parse(artifact)).toEqual(artifact);
  expect(manifestSchema.parse({ release: null, artifacts: {} })).toEqual({
    release: null,
    artifacts: {},
  });
  expect(() =>
    manifestSchema.parse({ release: 'bad', artifacts: {} }),
  ).toThrow();
});
describe('publish plan', () => {
  const input = {
    expected: sidecar.fingerprint,
    sidecar,
    actualHash: sha256,
    actualBytes: 5,
    renderCommand: 'render && publish',
  };
  it('uploads a valid first render and a newer changed render', () => {
    expect(planPublish(input).action).toBe('upload');
    expect(
      planPublish({
        ...input,
        published: {
          ...artifact,
          sha256: 'b'.repeat(64),
          renderedAt: '2026-10-04T00:00:00.000Z',
        },
      }).action,
    ).toBe('upload');
  });
  it('retains a fresh publication for missing, stale, corrupt, unchanged or older local files', () => {
    for (const patch of [
      { sidecar: undefined },
      { sidecar: { ...sidecar, fingerprint: 'b'.repeat(64) } },
      { actualHash: 'bad' },
      { actualBytes: 6 },
      {},
      { sidecar: { ...sidecar, renderedAt: '2026-10-04T00:00:00.000Z' } },
    ]) {
      expect(
        planPublish({ ...input, ...patch, published: artifact }).action,
      ).toBe('retain');
    }
  });
  it('fails with the rebuild command when neither version is current', () => {
    expect(() => planPublish({ ...input, sidecar: undefined })).toThrow(
      'render && publish',
    );
    expect(() =>
      planPublish({
        ...input,
        actualHash: 'bad',
        published: { ...artifact, fingerprint: 'b'.repeat(64) },
      }),
    ).toThrow('render && publish');
  });
});
function responses(type = 'video/mp4', disposition?: string) {
  const headers = {
    'content-type': type,
    'content-length': '5',
    'cache-control': 'public, max-age=31536000, immutable',
    ...(disposition ? { 'content-disposition': disposition } : {}),
  };
  return [
    new Response(null, { headers }),
    ...(type === 'video/mp4'
      ? [
          new Response(bytes.subarray(0, 2), {
            status: 206,
            headers: { 'content-range': 'bytes 0-1/5' },
          }),
        ]
      : []),
    new Response(bytes),
  ];
}
function requester(queue: Response[]) {
  return vi.fn<typeof fetch>().mockImplementation(async () => queue.shift()!);
}
it('verifies HEAD, MP4 Range and full identity checksum', async () => {
  const request = requester(responses());
  await verifyPublicArtifact(artifact, { fetch: request });
  expect(request.mock.calls.map((call) => call[1]?.headers)).toContainEqual({
    Range: 'bytes=0-1',
    'Accept-Encoding': 'identity',
  });
  await verifyPublicArtifact(
    { ...artifact, contentType: 'application/pdf' },
    {
      fetch: requester(responses('application/pdf', 'attachment')),
      disposition: 'attachment',
    },
  );
});
it('uses fetch by default', async () => {
  vi.stubGlobal('fetch', requester(responses()));
  try {
    await verifyPublicArtifact(artifact);
  } finally {
    vi.unstubAllGlobals();
  }
});
it('retries transient failures and ultimately reports the error', async () => {
  const request = requester(responses());
  request.mockRejectedValueOnce(new Error('network'));
  await verifyPublicArtifact(artifact, { fetch: request });
  await expect(
    verifyPublicArtifact(artifact, {
      fetch: vi.fn().mockRejectedValue(new Error('network')),
      attempts: 2,
    }),
  ).rejects.toThrow('network');
  await expect(verifyPublicArtifact(artifact, { attempts: 0 })).rejects.toThrow(
    'positive',
  );
  await expect(
    verifyPublicArtifact(artifact, { attempts: 1.5 }),
  ).rejects.toThrow('positive');
});
it.each([
  'status',
  'type',
  'length',
  'immutable',
  'age',
  'public',
  'disposition',
  'range-status',
  'range-header',
  'range-length',
  'get-status',
  'get-length',
  'get-hash',
])('rejects %s', async (failure) => {
  const queue = responses();
  if (
    [
      'status',
      'type',
      'length',
      'immutable',
      'age',
      'public',
      'disposition',
    ].includes(failure)
  ) {
    const headers = new Headers(queue[0]!.headers);
    if (failure === 'type') {
      headers.set('content-type', 'text/plain');
    }
    if (failure === 'length') {
      headers.set('content-length', '8');
    }
    if (failure === 'immutable') {
      headers.delete('cache-control');
    }
    if (failure === 'age') {
      headers.set('cache-control', 'public, immutable');
    }
    if (failure === 'public') {
      headers.set('cache-control', 'max-age=31536000, immutable');
    }
    queue[0] = new Response(null, {
      status: failure === 'status' ? 404 : 200,
      headers,
    });
  }
  if (failure === 'range-status') {
    queue[1] = new Response('he');
  }
  if (failure === 'range-header') {
    queue[1] = new Response('he', { status: 206 });
  }
  if (failure === 'range-length') {
    queue[1] = new Response('h', {
      status: 206,
      headers: { 'content-range': 'bytes 0-1/5' },
    });
  }
  if (failure === 'get-status') {
    queue[2] = new Response(bytes, { status: 500 });
  }
  if (failure === 'get-length') {
    queue[2] = new Response('bad');
  }
  if (failure === 'get-hash') {
    queue[2] = new Response('world');
  }
  await expect(
    verifyPublicArtifact(artifact, {
      fetch: requester(queue),
      attempts: 1,
      ...(failure === 'disposition' ? { disposition: 'attachment' } : {}),
    }),
  ).rejects.toThrow();
});
