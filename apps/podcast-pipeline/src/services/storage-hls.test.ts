import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  type S3Client,
} from '@aws-sdk/client-s3';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { replaceHls } from './storage-hls.js';

vi.mock('./ingest/step.js', () => ({ logPipelineEvent: vi.fn() }));
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((path) => rm(path, { recursive: true, force: true })),
  );
});
async function setup(section = 'main') {
  const dir = await mkdtemp(join(tmpdir(), 'hls-test-'));
  dirs.push(dir);
  const prefix = `episodes/ep/localizations/zh-Hant/${section}`;
  const playlistKey = `${prefix}/playlist.m3u8`;
  const store = new Map([
    [playlistKey, '#EXTM3U\nseg0.ts\nseg1.ts\nseg2.ts\n#EXT-X-ENDLIST\n'],
    [`${prefix}/seg0.ts`, 'old-0'],
    [`${prefix}/seg1.ts`, 'old-1'],
    [`${prefix}/seg2.ts`, 'old-2'],
  ]);
  let etag = 'old-etag';
  const send = vi.fn(async (command: unknown) => {
    if (command instanceof HeadObjectCommand) {
      if (!store.has(playlistKey))
        throw Object.assign(new Error('not found'), { name: 'NotFound' });
      return { ETag: etag };
    }
    if (command instanceof ListObjectsV2Command)
      return { Contents: [...store.keys()].map((Key) => ({ Key })) };
    if (command instanceof DeleteObjectsCommand) {
      for (const item of command.input.Delete!.Objects!)
        store.delete(item.Key!);
      return { Deleted: command.input.Delete!.Objects };
    }
    throw new Error('Unexpected command');
  });
  const put = vi.fn(
    async (object: {
      Key: string;
      path: string;
      ifMatch?: string;
      ifNoneMatch?: string;
    }) => {
      if (object.Key === playlistKey) {
        if (
          (object.ifMatch && object.ifMatch !== etag) ||
          (object.ifNoneMatch && store.has(playlistKey))
        )
          throw new Error('PreconditionFailed');
        etag = 'new-etag';
      }
      store.set(object.Key, await readFile(object.path, 'utf8'));
    },
  );
  await writeFile(
    join(dir, 'playlist.m3u8'),
    '#EXTM3U\n#EXTINF:6,\nseg0.ts\n#EXT-X-ENDLIST\n',
  );
  await writeFile(join(dir, 'seg0.ts'), 'new-audio');
  const files = [
    {
      name: 'playlist.m3u8',
      path: join(dir, 'playlist.m3u8'),
      contentType: 'application/vnd.apple.mpegurl',
    },
    { name: 'seg0.ts', path: join(dir, 'seg0.ts'), contentType: 'video/mp2t' },
  ];
  return {
    prefix,
    playlistKey,
    store,
    send,
    put,
    files,
    run: () =>
      replaceHls({
        r2: { send } as unknown as S3Client,
        bucket: 'bucket',
        prefix,
        files,
        put,
      }),
    changeEtag: () => {
      etag = 'competitor';
    },
  };
}

describe('safe HLS replacement', () => {
  it('publishes a shorter playlist last and removes stale segments while retaining current objects', async () => {
    const h = await setup();
    await h.run();
    expect(h.store.size).toBe(2);
    const text = h.store.get(h.playlistKey)!;
    const segment = text
      .split('\n')
      .find((line) => line && !line.startsWith('#'))!;
    expect(h.store.get(`${h.prefix}/${segment}`)).toBe('new-audio');
    expect(h.put.mock.calls.at(-1)?.[0]).toMatchObject({
      Key: h.playlistKey,
      ifMatch: 'old-etag',
      cacheControl: 'no-cache, max-age=0, must-revalidate',
    });
  });
  it.each(['segment', 'playlist'])(
    'leaves the previous playable generation intact on %s upload failure',
    async (phase) => {
      const h = await setup();
      const before = new Map(h.store);
      const write = h.put.getMockImplementation()!;
      h.put.mockImplementation(async (object) => {
        if ((object.Key === h.playlistKey) === (phase === 'playlist'))
          throw new Error('upload failed');
        await write(object);
      });
      await expect(h.run()).rejects.toThrow('upload failed');
      for (const [key, value] of before) expect(h.store.get(key)).toBe(value);
      expect(
        h.send.mock.calls.some(([c]) => c instanceof DeleteObjectsCommand),
      ).toBe(false);
    },
  );
  it('rejects a concurrent playlist replacement without deleting its objects', async () => {
    const h = await setup();
    const write = h.put.getMockImplementation()!;
    h.put.mockImplementation(async (object) => {
      if (object.Key === h.playlistKey) h.changeEtag();
      await write(object);
    });
    await expect(h.run()).rejects.toThrow('PreconditionFailed');
    expect(h.store.has(`${h.prefix}/seg2.ts`)).toBe(true);
    expect(
      h.send.mock.calls.some(([c]) => c instanceof DeleteObjectsCommand),
    ).toBe(false);
  });
  it('does not sweep per-target classroom children or unknown files', async () => {
    const h = await setup('classroom');
    h.store.set(`${h.prefix}/ja/seg0.ts`, 'japanese');
    h.store.set(`${h.prefix}/en/playlist.m3u8`, 'english');
    h.store.set(`${h.prefix}/keep.json`, '{}');
    await h.run();
    expect(h.store.get(`${h.prefix}/ja/seg0.ts`)).toBe('japanese');
    expect(h.store.has(`${h.prefix}/en/playlist.m3u8`)).toBe(true);
    expect(h.store.has(`${h.prefix}/keep.json`)).toBe(true);
  });
  it('uses create-only publication when no previous playlist exists', async () => {
    const h = await setup();
    h.store.clear();
    await h.run();
    expect(h.put.mock.calls.at(-1)?.[0]).toMatchObject({ ifNoneMatch: '*' });
  });
  it('rejects incomplete playlists before uploading', async () => {
    const h = await setup();
    h.files.pop();
    await expect(h.run()).rejects.toThrow('Missing HLS segment');
    expect(h.put).not.toHaveBeenCalled();
  });
  it('keeps publication successful when stale-object cleanup fails', async () => {
    const h = await setup();
    const send = h.send.getMockImplementation()!;
    h.send.mockImplementation(async (command) => {
      if (command instanceof DeleteObjectsCommand) throw new Error('denied');
      return send(command);
    });
    await expect(h.run()).resolves.toBeUndefined();
    expect(h.store.get(h.playlistKey)).toContain('seg-');
  });
});
