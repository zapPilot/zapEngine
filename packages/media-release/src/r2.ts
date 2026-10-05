import {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

export function createR2Client(credentials: {
  endpoint: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: credentials.endpoint,
    credentials: {
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
    },
    maxAttempts: 1,
  });
}
export async function putImmutable(
  client: Pick<S3Client, 'send'>,
  input: {
    bucket: string;
    key: string;
    body: Buffer;
    sha256: string;
    contentType: string;
    disposition?: string;
  },
  attempts = 3,
): Promise<void> {
  if (!Number.isInteger(attempts) || attempts < 1) {
    throw new Error('attempts must be positive');
  }
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: input.bucket,
          Key: input.key,
          Body: input.body,
          ContentType: input.contentType,
          ContentDisposition: input.disposition,
          CacheControl: 'public, max-age=31536000, immutable',
          IfNoneMatch: '*',
          ChecksumSHA256: Buffer.from(input.sha256, 'hex').toString('base64'),
          Metadata: { sha256: input.sha256 },
        }),
      );
      return;
    } catch (error) {
      if (
        (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === 412
      ) {
        const existing = await client.send(
          new HeadObjectCommand({ Bucket: input.bucket, Key: input.key }),
        );
        if (existing.Metadata?.['sha256'] === input.sha256) {
          return;
        }
        throw new Error(`Immutable object collision: ${input.key}`);
      }
      if (attempt === attempts - 1) {
        throw error;
      }
    }
  }
}
