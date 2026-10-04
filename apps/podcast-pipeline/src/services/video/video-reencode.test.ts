import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  mkdir: vi.fn(),
  append: vi.fn(),
  stat: vi.fn(),
  download: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
  process: vi.fn(),
  db: { from: vi.fn() },
  main: vi.fn(() => false),
  cli: vi.fn(),
}));
vi.mock('node:fs/promises', () => ({
  readFile: mocks.read,
  writeFile: mocks.write,
  mkdir: mocks.mkdir,
  appendFile: mocks.append,
  stat: mocks.stat,
}));
vi.mock('../r2-objects.js', () => ({
  createR2ClientFromEnv: () => ({ send: mocks.send }),
  downloadR2Object: mocks.download,
}));
vi.mock('../storage.js', () => ({ uploadVideoArtifactsToR2: mocks.upload }));
vi.mock('../supabase-client.js', () => ({
  getPipelineSupabase: () => mocks.db,
  throwSupabaseError: (error: unknown) => {
    throw error;
  },
}));
vi.mock('../../lib/env.js', () => ({
  getRequiredEnv: (key: string) =>
    key === 'R2_PUBLIC_BASE_URL' ? 'https://cdn.test' : 'bucket',
  trimTrailingSlash: (value: string) => value.replace(/\/$/, ''),
}));
vi.mock('./audio-analysis.js', () => ({
  resolveVideoFfprobePath: () => 'ffprobe',
}));
vi.mock('./ffmpeg-video.js', () => ({
  resolveVideoFfmpegPath: () => 'ffmpeg',
  runProcess: mocks.process,
  videoCodecArgs: () => ['-c:v', 'libx264'],
  X264_CRF: '20',
}));
vi.mock('../../lib/is-main-module.js', () => ({ isMainModule: mocks.main }));
vi.mock('../../lib/cli-runner.js', () => ({ runCli: mocks.cli }));
import {
  runVideoReencodeCli,
  validateReencodeCandidate,
  validateReencodedMedia,
} from './video-reencode.js';
const prefix = 'episodes/ep/localizations/en/video/v1/hash';
const row = {
  episode_localization_id: '00000000-0000-4000-8000-000000000000',
  status: 'completed' as const,
  r2_prefix: prefix,
  mp4_url: `https://cdn.test/${prefix}/video.mp4`,
  thumbnail_url: `https://cdn.test/${prefix}/thumbnail.png`,
  manifest_url: `https://cdn.test/${prefix}/manifest.json`,
  captions_ass_url: `https://cdn.test/${prefix}/captions.ass`,
  duration_seconds: 10,
};
const candidate = { ...row, bytes: 4000000, kbps: 3200 };
const original = {
  streams: [
    { codec_type: 'video', width: 1920, height: 1080, avg_frame_rate: '30/1' },
    { codec_type: 'audio' },
  ],
  format: { duration: 10 },
};
const encoded = {
  ...original,
  streams: [
    { ...original.streams[0]!, width: 1280, height: 720 },
    { codec_type: 'audio' },
  ],
};
function query(pages: unknown[], error: unknown = null) {
  const q = {
    select: vi.fn(() => q),
    eq: vi.fn(() => q),
    order: vi.fn(() => q),
    limit: vi.fn(() => q),
    gt: vi.fn(() => q),
    update: vi.fn((value: unknown) => {
      expect(value).toEqual(expect.any(Object));
      return q;
    }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve(resolve({ data: pages.shift(), error })),
  };
  mocks.db.from.mockReturnValue(q);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.main.mockReturnValue(false);
  mocks.read.mockImplementation(async (path: string) =>
    path.endsWith('plan.json')
      ? JSON.stringify([candidate])
      : Buffer.from('encoded'),
  );
  mocks.stat.mockImplementation(async (path: string) => ({
    size: path.endsWith('encoded.mp4') ? 100 : 400,
  }));
  mocks.send.mockResolvedValue({ ContentLength: 4000000 });
  mocks.process.mockImplementation(
    async (executable: string, args: string[]) => {
      if (executable === 'ffprobe')
        return {
          stdout: JSON.stringify(
            args.at(-1)?.endsWith('encoded.mp4') ? encoded : original,
          ),
          stderr: '',
        };
      if (args[0] === '-encoders') return { stdout: 'libx264', stderr: '' };
      if (args[0] === '-filters') return { stdout: 'libvmaf', stderr: '' };
      return { stdout: '', stderr: 'VMAF score: 95.5' };
    },
  );
});
afterEach(() => vi.restoreAllMocks());
it('rejects escaping prefixes and all cross-prefix sidecars', () => {
  expect(() =>
    validateReencodeCandidate(
      { ...row, r2_prefix: '../bad' },
      'https://cdn.test',
    ),
  ).toThrow();
  expect(() =>
    validateReencodeCandidate(
      { ...row, thumbnail_url: 'https://other.test/thumbnail.png' },
      'https://cdn.test',
    ),
  ).toThrow();
  validateReencodeCandidate(row, 'https://cdn.test');
});
it('validates stream counts, duration, resolution, ratio, VMAF and fps', () => {
  validateReencodedMedia(original, encoded, 0.5, 93);
  for (const changed of [
    { ...encoded, streams: [] },
    { ...encoded, streams: [encoded.streams[0]!] },
    { ...encoded, streams: [encoded.streams[0]!, { codec_type: 'data' }] },
    { ...encoded, streams: [{ codec_type: 'video' }, { codec_type: 'audio' }] },
    {
      ...encoded,
      streams: [{ codec_type: 'video', width: 1280 }, { codec_type: 'audio' }],
    },
    { ...encoded, format: { duration: 12 } },
    {
      ...encoded,
      streams: [
        { ...encoded.streams[0]!, avg_frame_rate: '24/1' },
        { codec_type: 'audio' },
      ],
    },
  ])
    expect(() => validateReencodedMedia(original, changed, 0.5, 93)).toThrow();
  expect(() => validateReencodedMedia(original, encoded, 0.6, 95)).toThrow();
  expect(() => validateReencodedMedia(original, encoded, 0.4, NaN)).toThrow();
  expect(() => validateReencodedMedia(original, encoded, 0.4, 92)).toThrow();
});
it.each([
  [],
  ['wat', '--work-dir', '/workspace/backup'],
  ['plan'],
  ['plan', '--work-dir'],
  ['plan', '--work-dir', '/workspace/backup', '--wat'],
  ['plan', '--work-dir', '/workspace/backup', '--min-kbps'],
  ['plan', '--work-dir', '/workspace/backup', '--min-kbps', 'NaN'],
  ['plan', '--work-dir', '/workspace/backup', '--min-kbps', '0'],
  ['encode', '--work-dir', '/workspace/backup', '--min-kbps', '2000'],
])('rejects malformed command %j', async (...args) =>
  expect(runVideoReencodeCli(args)).rejects.toThrow(),
);
it('plans paginated completed rows by measured R2 size without mutations', async () => {
  const q = query([
    [row],
    [
      {
        ...row,
        episode_localization_id: '00000000-0000-4000-8000-000000000001',
        duration_seconds: 100,
      },
    ],
    [],
  ]);
  await runVideoReencodeCli(['plan', '--work-dir', '/workspace/backup']);
  expect(q.gt).toHaveBeenCalled();
  expect(mocks.write).toHaveBeenCalledWith(
    '/workspace/backup/plan.json',
    JSON.stringify([candidate], null, 2),
    { flag: 'wx' },
  );
  expect(q.update).not.toHaveBeenCalled();
});
it('accepts an explicit threshold', async () => {
  query([[]]);
  await runVideoReencodeCli([
    'plan',
    '--work-dir',
    '/workspace/backup',
    '--min-kbps',
    '3000',
  ]);
  expect(mocks.write).toHaveBeenCalledWith(
    '/workspace/backup/plan.json',
    '[]',
    { flag: 'wx' },
  );
});

it.each([
  ['incomplete', null, null],
  ['db', [], new Error('db')],
  ['cursor', [row], null],
])('fails closed on %s reads', async (kind, page, error) => {
  query(kind === 'cursor' ? [[row], [row]] : [page], error);
  await expect(
    runVideoReencodeCli(['plan', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow();
});
it.each([undefined, 0])('rejects unknown source sizes %s', async (size) => {
  query([[row]]);
  mocks.send.mockResolvedValue({ ContentLength: size });
  await expect(
    runVideoReencodeCli(['plan', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('source size');
});
it('encodes locally and keeps sidecar backups without publishing', async () => {
  await runVideoReencodeCli(['encode', '--work-dir', '/workspace/backup']);
  expect(mocks.download).toHaveBeenCalledTimes(4);
  expect(mocks.upload).not.toHaveBeenCalled();
  expect(
    mocks.process.mock.calls.find(([, args]) => args.includes('-n'))?.[1],
  ).toContain('copy');
  expect(mocks.write).toHaveBeenCalledWith(
    expect.stringContaining('verification.json'),
    expect.any(String),
    { flag: 'wx' },
  );
});
it.each(['encoders', 'filters'])('preflights missing %s', async (kind) => {
  mocks.process.mockImplementation(async (_: string, args: string[]) => ({
    stdout: args[0] === `-${kind}` ? '' : 'libx264 libvmaf',
    stderr: '',
  }));
  await expect(
    runVideoReencodeCli(['encode', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('requires');
});
it.each([undefined, '0/1'])('rejects invalid source fps %s', async (fps) => {
  const impl = mocks.process.getMockImplementation()!;
  mocks.process.mockImplementation(async (exe: string, args: string[]) =>
    exe === 'ffprobe'
      ? {
          stdout: JSON.stringify({
            ...original,
            streams:
              fps === undefined
                ? []
                : [{ ...original.streams[0], avg_frame_rate: fps }],
          }),
          stderr: '',
        }
      : impl(exe, args),
  );
  await expect(
    runVideoReencodeCli(['encode', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('source fps');
});
it('rejects missing VMAF scores', async () => {
  const impl = mocks.process.getMockImplementation()!;
  mocks.process.mockImplementation(async (exe: string, args: string[]) =>
    args.includes('-lavfi') ? { stdout: '', stderr: '' } : impl(exe, args),
  );
  await expect(
    runVideoReencodeCli(['encode', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('quality validation');
});
async function prepareApply(
  data: unknown = [{ episode_localization_id: row.episode_localization_id }],
  error: unknown = null,
) {
  const { createHash } = await import('node:crypto');
  const next = `${prefix.slice(0, prefix.lastIndexOf('/'))}/720p-${createHash('sha256').update('encoded').digest('hex')}`;
  mocks.upload.mockResolvedValue({
    r2Prefix: next,
    mp4Url: `https://cdn.test/${next}/video.mp4`,
    thumbnailUrl: `https://cdn.test/${next}/thumbnail.png`,
    manifestUrl: `https://cdn.test/${next}/manifest.json`,
    captionsAssUrl: `https://cdn.test/${next}/captions.ass`,
  });
  return { q: query([data], error) };
}
it('uploads to a sibling leaf and conditionally switches exactly one completed row with a journal', async () => {
  const { q } = await prepareApply();
  await runVideoReencodeCli(['apply', '--work-dir', '/workspace/backup']);
  expect(q.eq).toHaveBeenCalledWith('r2_prefix', prefix);
  expect(q.eq).toHaveBeenCalledWith('mp4_url', row.mp4_url);
  expect(q.update.mock.calls[0]?.[0]).not.toHaveProperty('status');
  expect(mocks.append).toHaveBeenCalledTimes(2);
});
it.each([[], null, [{}, {}]])(
  'rejects non-single-row apply response %j',
  async (data) => {
    await prepareApply(data);
    await expect(
      runVideoReencodeCli(['apply', '--work-dir', '/workspace/backup']),
    ).rejects.toThrow('exactly one');
    expect(mocks.append).toHaveBeenCalledTimes(1);
  },
);
it('stops on GC-fenced DB errors', async () => {
  await prepareApply([], new Error('55000 fenced'));
  await expect(
    runVideoReencodeCli(['apply', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('55000');
});
it('rejects a mismatching upload prefix', async () => {
  await prepareApply();
  mocks.upload.mockResolvedValue({ r2Prefix: 'wrong' });
  await expect(
    runVideoReencodeCli(['apply', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('Unexpected upload');
});
it('refuses overlapping prefix leaves', async () => {
  const changed = { ...candidate, r2_prefix: prefix.replace(/hash$/, '720p-') };
  for (const key of [
    'mp4_url',
    'thumbnail_url',
    'manifest_url',
    'captions_ass_url',
  ] as const)
    changed[key] = changed[key].replace('/hash/', '/720p-/');
  mocks.read.mockResolvedValue(JSON.stringify([changed]));
  await expect(
    runVideoReencodeCli(['apply', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('overlaps');
});
it('invokes its main entry', async () => {
  vi.resetModules();
  mocks.main.mockReturnValue(true);
  query([[]]);
  await import('./video-reencode.js');
  const saved = process.argv;
  process.argv = [
    'node',
    'reencode',
    'plan',
    '--work-dir',
    '/workspace/backup',
  ];
  try {
    await mocks.cli.mock.calls[0]![0]();
    expect(mocks.write).toHaveBeenCalled();
  } finally {
    process.argv = saved;
  }
});

it('rolls back only journaled applied rows using the new URLs as conditional guards', async () => {
  const next = {
    mp4_url: 'https://cdn.test/new/video.mp4',
    thumbnail_url: 'https://cdn.test/new/thumbnail.png',
    manifest_url: 'https://cdn.test/new/manifest.json',
    captions_ass_url: 'https://cdn.test/new/captions.ass',
    r2_prefix: 'new',
  };
  const entry = { id: row.episode_localization_id, old: candidate, next };
  mocks.read.mockResolvedValue(
    [
      JSON.stringify({ event: 'reencode:prepared', ...entry }),
      JSON.stringify({ event: 'reencode:applied', ...entry }),
      '',
    ].join('\n'),
  );
  const q = query([[{ episode_localization_id: row.episode_localization_id }]]);
  await runVideoReencodeCli(['rollback', '--work-dir', '/workspace/backup']);
  expect(q.eq).toHaveBeenCalledWith('r2_prefix', 'new');
  expect(q.update).toHaveBeenCalledWith(
    expect.objectContaining({ r2_prefix: prefix, mp4_url: row.mp4_url }),
  );
  expect(mocks.send).toHaveBeenCalledTimes(4);
  expect(mocks.append).toHaveBeenCalledWith(
    '/workspace/backup/journal.jsonl',
    expect.stringContaining('reencode:rolled-back'),
  );
  expect(mocks.process).not.toHaveBeenCalled();
  mocks.read.mockResolvedValue(
    [
      JSON.stringify({ event: 'reencode:applied', ...entry }),
      JSON.stringify({ event: 'reencode:rolled-back', ...entry }),
    ].join('\n'),
  );
  await runVideoReencodeCli(['rollback', '--work-dir', '/workspace/backup']);
  expect(q.update).toHaveBeenCalledOnce();
});
it('refuses a corrupted rollback journal identity', async () => {
  mocks.read.mockResolvedValue(
    JSON.stringify({
      event: 'reencode:applied',
      id: '00000000-0000-4000-8000-000000000001',
      old: candidate,
      next: candidate,
    }),
  );
  await expect(
    runVideoReencodeCli(['rollback', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('identity mismatch');
});
it('fails rollback if original artifacts are already gone', async () => {
  mocks.read.mockResolvedValue(
    JSON.stringify({
      event: 'reencode:applied',
      id: row.episode_localization_id,
      old: candidate,
      next: candidate,
    }),
  );
  mocks.send.mockRejectedValue(new Error('NoSuchKey'));
  await expect(
    runVideoReencodeCli(['rollback', '--work-dir', '/workspace/backup']),
  ).rejects.toThrow('NoSuchKey');
  expect(mocks.append).not.toHaveBeenCalled();
});
