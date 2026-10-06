import { DeleteObjectsCommand, type S3Client } from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';

import { deleteR2Objects, listR2Objects } from './r2-objects.js';

describe('R2 pagination and deletion', () => {
  it('reads every page and rejects missing continuation tokens', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({
        Contents: [{ Key: 'episodes/a', Size: 12 }],
        IsTruncated: true,
        NextContinuationToken: 'next',
      })
      .mockResolvedValueOnce({ Contents: [{ Key: 'episodes/b', Size: 15 }] });
    const r2 = { send } as unknown as S3Client;
    expect(
      (await listR2Objects(r2, 'bucket', 'episodes/')).map((o) => o.key),
    ).toEqual(['episodes/a', 'episodes/b']);
    expect(send.mock.calls[1]?.[0].input.ContinuationToken).toBe('next');
    send.mockResolvedValue({ IsTruncated: true });
    await expect(listR2Objects(r2, 'bucket', 'episodes/')).rejects.toThrow(
      'Incomplete R2 listing',
    );
  });
  it('batches more than 1000 objects and checks per-key errors', async () => {
    const send = vi.fn(async (command: DeleteObjectsCommand) => ({
      Deleted: command.input.Delete!.Objects,
    }));
    const r2 = { send } as unknown as S3Client;
    await deleteR2Objects(
      r2,
      'bucket',
      Array.from({ length: 1001 }, (_, index) => `key-${index}`),
    );
    expect(send).toHaveBeenCalledTimes(2);
    send.mockResolvedValue({
      Errors: [{ Key: 'key', Code: 'AccessDenied' }],
    } as never);
    await expect(deleteR2Objects(r2, 'bucket', ['key'])).rejects.toThrow(
      'R2 deletion failed',
    );
    send.mockResolvedValue({} as never);
    await expect(deleteR2Objects(r2, 'bucket', ['key'])).rejects.toThrow(
      'did not confirm',
    );
  });
  it('rejects a listing whose keys escape the requested prefix', async () => {
    const send = vi.fn().mockResolvedValue({
      Contents: [{ Key: 'other/a', Size: 12 }],
      IsTruncated: false,
    });
    const r2 = { send } as unknown as S3Client;
    await expect(listR2Objects(r2, 'bucket', 'episodes/')).rejects.toThrow(
      'Invalid R2 listing',
    );
  });
});

it('downloads through S3 without overwriting a backup', async () => {
  const { Readable } = await import('node:stream');
  const { mkdtemp, readFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { downloadR2Object } = await import('./r2-objects.js');
  const directory = await mkdtemp(join(tmpdir(), 'r2-download-'));
  const send = vi
    .fn()
    .mockImplementation(async () => ({ Body: Readable.from(['original']) }));
  const r2 = { send } as unknown as S3Client;
  try {
    await downloadR2Object(r2, 'bucket', 'key', join(directory, 'backup'));
    expect(await readFile(join(directory, 'backup'), 'utf8')).toBe('original');
    await expect(
      downloadR2Object(r2, 'bucket', 'key', join(directory, 'backup')),
    ).rejects.toThrow();
    send.mockResolvedValue({});
    await expect(
      downloadR2Object(r2, 'bucket', 'key', join(directory, 'missing')),
    ).rejects.toThrow('Missing R2');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
