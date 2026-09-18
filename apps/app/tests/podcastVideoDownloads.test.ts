import { describe, expect, it } from 'vitest';
import {
  downloadedEpisodeRows,
  mergeDownloadRecord,
  parseStoredVideoDownloads,
  removeDownloadRecord,
  resolveOfflineEpisodeVideo,
  totalDownloadedBytes,
  videoDownloadFileNames,
} from '@/integration/podcastVideoDownloads';
import { downloadableEpisode, downloadRecord } from './support/podcastDownload';

describe('offline video manifest', () => {
  it.each([null, '', '{', '{}', 'null', '1', '[null, [], 4, "x"]'])(
    'rejects malformed storage %s',
    (raw) => expect(parseStoredVideoDownloads(raw)).toEqual([]),
  );
  it('validates each row, dates, positive finite sizes and confined filenames', () => {
    const good = downloadRecord();
    const bad = [
      { title: '' },
      { languageCode: 4 },
      { byteSize: -1 },
      { byteSize: 1.5 },
      { durationSeconds: null },
      { downloadedAt: 'invalid' },
      { createdAt: 'invalid' },
      { videoFileName: '../secret.mp4' },
      { thumbnailFileName: '/tmp/x.jpg' },
    ].map((overrides) => ({ ...good, ...overrides }));
    expect(parseStoredVideoDownloads(JSON.stringify([...bad, good]))).toEqual([
      good,
    ]);
  });
  it('merges localization identities, removes and sums bytes', () => {
    const a = downloadRecord();
    const b = downloadRecord({ localizationId: 'en', byteSize: 300 });
    const records = mergeDownloadRecord([a, b], { ...a, byteSize: 400 });
    expect(records).toHaveLength(2);
    expect(totalDownloadedBytes(records)).toBe(700);
    expect(removeDownloadRecord(records, a.localizationId)).toEqual([b]);
    expect(totalDownloadedBytes([])).toBe(0);
    expect(
      parseStoredVideoDownloads(JSON.stringify([a, { ...a, byteSize: 400 }])),
    ).toEqual([{ ...a, byteSize: 400 }]);
  });
  it('encodes hostile identities and replaces both media URLs', () => {
    const record = downloadRecord({ localizationId: '../hello/世界' });
    expect(videoDownloadFileNames(record.localizationId).video).not.toContain(
      '/',
    );
    const localUri = (name: string) => `file:///documents/${name}`;
    expect(resolveOfflineEpisodeVideo(null, record, localUri)).toEqual({
      url: localUri(record.videoFileName),
      thumbnailUrl: localUri(record.thumbnailFileName),
      durationSeconds: 60,
    });
    expect(
      resolveOfflineEpisodeVideo(
        downloadableEpisode.video,
        undefined,
        localUri,
      ),
    ).toBe(downloadableEpisode.video);
    expect(resolveOfflineEpisodeVideo(null, undefined, localUri)).toBeNull();
  });
  it('projects snapshots without network audio and sorts without mutating', () => {
    const records = [
      downloadRecord({ localizationId: 'old', createdAt: '2025-01-01' }),
      downloadRecord({ localizationId: 'new' }),
    ];
    expect(
      downloadedEpisodeRows(records, 'newest').map((r) => r.localizationId),
    ).toEqual(['new', 'old']);
    expect(downloadedEpisodeRows(records, 'oldest')[0]).toMatchObject({
      localizationId: 'old',
      hlsUrl: '',
      audioTracks: [],
      languageClassrooms: [],
      title: 'Episode',
    });
    expect(records[0]?.localizationId).toBe('old');
    expect(
      downloadedEpisodeRows(
        [
          downloadRecord({ localizationId: 'b' }),
          downloadRecord({ localizationId: 'a' }),
        ],
        'oldest',
      )[0]?.localizationId,
    ).toBe('a');
  });
});
