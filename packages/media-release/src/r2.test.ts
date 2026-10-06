import { HeadObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { expect, it, vi } from 'vitest';
import { createR2Client, putImmutable } from './r2.js';
const input = {
  bucket: 'test',
  key: 'releases/file',
  body: Buffer.from('hi'),
  sha256: 'a'.repeat(64),
  contentType: 'application/pdf',
  disposition: 'attachment',
};
it('creates a caller-owned R2 client without reading env', async () => {
  const client = createR2Client({
    endpoint: 'https://example.com',
    accessKeyId: 'id',
    secretAccessKey: 'secret',
  });
  expect(await client.config.region()).toBe('auto');
  expect(await client.config.credentials()).toMatchObject({
    accessKeyId: 'id',
    secretAccessKey: 'secret',
  });
  client.destroy();
});
it('uploads immutable, checksum-protected bytes', async () => {
  const send = vi.fn().mockResolvedValue({});
  await putImmutable({ send }, input);
  const command = send.mock.calls[0]![0] as PutObjectCommand;
  expect(command).toBeInstanceOf(PutObjectCommand);
  expect(command.input).toMatchObject({
    IfNoneMatch: '*',
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: { sha256: input.sha256 },
    ChecksumSHA256: Buffer.from(input.sha256, 'hex').toString('base64'),
    ContentDisposition: 'attachment',
  });
});
it('retries failure within a bounded budget', async () => {
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error('transient'))
    .mockResolvedValue({});
  await putImmutable({ send }, input);
  expect(send).toHaveBeenCalledTimes(2);
  await expect(
    putImmutable(
      { send: vi.fn().mockRejectedValue(new Error('network')) },
      input,
      2,
    ),
  ).rejects.toThrow('network');
  await expect(putImmutable({ send }, input, 0)).rejects.toThrow('positive');
  await expect(putImmutable({ send }, input, 1.5)).rejects.toThrow('positive');
});
it('accepts 412 only with identical sha metadata', async () => {
  const collision = { $metadata: { httpStatusCode: 412 } };
  const send = vi
    .fn()
    .mockRejectedValueOnce(collision)
    .mockResolvedValue({ Metadata: { sha256: input.sha256 } });
  await putImmutable({ send }, input);
  expect(send.mock.calls[1]![0]).toBeInstanceOf(HeadObjectCommand);
  for (const metadata of [{ Metadata: { sha256: 'bad' } }, {}]) {
    await expect(
      putImmutable(
        {
          send: vi
            .fn()
            .mockRejectedValueOnce(collision)
            .mockResolvedValue(metadata),
        },
        input,
      ),
    ).rejects.toThrow('collision');
  }
});
