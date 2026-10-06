import { describe, expect, it } from 'vitest';
import {
  describeEpisodeDownload,
  downloadedEpisodeRows,
  mergeDownloadRecord,
  parseStoredVideoDownloads,
  removeDownloadRecord,
  resolveOfflineEpisodeVideo,
  runningDownloads,
  sortDownloadRecords,
  totalDownloadedBytes,
  videoDownloadFileNames,
  type PodcastDownloadState,
} from '@/integration/podcastVideoDownloads';
import { downloadableEpisode, downloadRecord } from './support/podcastDownload';

/** What the provider stamps onto every running download. */
const running = {
  title: 'Running episode',
  thumbnailUrl: 'https://example.com/cover.jpg',
  durationSeconds: 125,
};

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

describe('download record ordering', () => {
  const records = [
    downloadRecord({ localizationId: 'b', createdAt: '2026-01-02' }),
    downloadRecord({ localizationId: 'a', createdAt: '2026-01-02' }),
    downloadRecord({ localizationId: 'c', createdAt: '2026-01-01' }),
  ];
  it('orders by publish date, breaking ties by identity, in either direction', () => {
    expect(
      sortDownloadRecords(records, 'newest').map((r) => r.localizationId),
    ).toEqual(['b', 'a', 'c']);
    expect(
      sortDownloadRecords(records, 'oldest').map((r) => r.localizationId),
    ).toEqual(['c', 'a', 'b']);
  });
  it('returns a copy and leaves the input order alone', () => {
    const sorted = sortDownloadRecords(records, 'oldest');
    expect(sorted).not.toBe(records);
    expect(records.map((r) => r.localizationId)).toEqual(['b', 'a', 'c']);
  });
});

describe('describeEpisodeDownload', () => {
  const record = downloadRecord({ byteSize: 4242 });
  const base = {
    isSupported: true,
    hasVideo: true,
    record: undefined,
    state: undefined,
  };
  const empty = { percent: 0, message: null, byteSize: null };

  it('reports a platform that cannot download before anything else', () => {
    expect(
      describeEpisodeDownload({
        ...base,
        isSupported: false,
        hasVideo: false,
        record,
        state: { status: 'downloading', progress: 0.5, ...running },
      }),
    ).toEqual({ phase: 'unsupported', ...empty });
  });
  it('treats a video-less episode as unavailable only while nothing is saved', () => {
    expect(describeEpisodeDownload({ ...base, hasVideo: false })).toEqual({
      phase: 'unavailable',
      ...empty,
    });
    expect(
      describeEpisodeDownload({ ...base, hasVideo: false, record }),
    ).toEqual({ phase: 'downloaded', ...empty, byteSize: 4242 });
  });
  it('shows whole-percent progress while a transfer runs, even over a stale record', () => {
    const state: PodcastDownloadState = {
      status: 'downloading',
      progress: 0.419,
      ...running,
    };
    expect(describeEpisodeDownload({ ...base, state })).toEqual({
      phase: 'downloading',
      ...empty,
      percent: 41,
    });
    expect(describeEpisodeDownload({ ...base, record, state }).phase).toBe(
      'downloading',
    );
  });
  it.each([
    [0, 0],
    [0.419, 41],
    [0.99, 99],
    [1, 100],
    [3, 100],
    [-0.5, 0],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])(
    'turns progress %s into %s%%, whatever the transfer reports',
    (progress, percent) =>
      expect(
        describeEpisodeDownload({
          ...base,
          state: { status: 'downloading', progress, ...running },
        }).percent,
      ).toBe(percent),
  );
  it('keeps a failed removal visible while the video is still saved', () => {
    expect(
      describeEpisodeDownload({
        ...base,
        record,
        state: { status: 'failed', message: 'Unable to remove download.' },
      }),
    ).toEqual({
      phase: 'downloaded',
      ...empty,
      byteSize: 4242,
      message: 'Unable to remove download.',
    });
  });
  it('carries the failure message when nothing is saved', () => {
    expect(
      describeEpisodeDownload({
        ...base,
        state: { status: 'failed', message: 'No space' },
      }),
    ).toEqual({ phase: 'failed', ...empty, message: 'No space' });
  });
  it.each<PodcastDownloadState | undefined>([
    undefined,
    { status: 'idle' },
    { status: 'downloaded' },
  ])('is idle with no record and state %j', (state) =>
    expect(describeEpisodeDownload({ ...base, state })).toEqual({
      phase: 'idle',
      ...empty,
    }),
  );
});

describe('runningDownloads', () => {
  it('lists only transfers in flight, in the order they started, with their percent', () => {
    expect(
      runningDownloads({
        three: { status: 'downloading', progress: 0.25, ...running },
        one: {
          status: 'downloading',
          progress: 0.9,
          ...running,
          title: 'First',
        },
        two: { status: 'failed', message: 'x' },
        four: { status: 'downloaded' },
        five: { status: 'idle' },
      }),
    ).toEqual([
      { localizationId: 'three', ...running, percent: 25 },
      { localizationId: 'one', ...running, title: 'First', percent: 90 },
    ]);
  });
  it('names a download from its own state, with no feed involved', () => {
    expect(
      runningDownloads({
        old: { status: 'downloading', progress: 0, ...running },
      }),
    ).toEqual([{ localizationId: 'old', ...running, percent: 0 }]);
  });
  it('is empty when nothing is running', () => {
    expect(runningDownloads({})).toEqual([]);
  });
});
