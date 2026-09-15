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
});
