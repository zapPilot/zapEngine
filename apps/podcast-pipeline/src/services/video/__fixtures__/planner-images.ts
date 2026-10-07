import { createHash } from 'node:crypto';
import { join } from 'node:path';

export function fixtureRemoteImage(url: string, directory: string) {
  const digest = createHash('sha256').update(url).digest('hex');
  return {
    path: join(directory, `${digest}.jpg`),
    contentType: 'image/jpeg' as const,
    sha256: digest,
    width: 2400,
    height: 1350,
  };
}
export function fixtureImageFingerprint(path: string): string {
  return createHash('sha256').update(path).digest('hex').slice(0, 16);
}
export function fixtureBraveResults(query: string, count: number) {
  return Array.from({ length: count }, (_, index) => ({
    imageUrl: `https://images.test/${encodeURIComponent(query)}-${index}.jpg`,
    sourceUrl: 'https://publisher.test/story',
    origin: 'brave' as const,
    altText: query,
    width: 2400,
    height: 1350,
  }));
}
