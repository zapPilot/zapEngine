import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  remove: vi.fn(),
  main: vi.fn(() => false),
  cli: vi.fn(),
}));
vi.mock('./r2-objects.js', () => ({
  createR2ClientFromEnv: () => 'r2',
  listR2Objects: mocks.list,
  deleteR2Objects: mocks.remove,
}));
vi.mock('../lib/env.js', () => ({ getRequiredEnv: () => 'bucket' }));
vi.mock('../lib/is-main-module.js', () => ({ isMainModule: mocks.main }));
vi.mock('../lib/cli-runner.js', () => ({ runCli: mocks.cli }));
import {
  classifyLegacyArtifact,
  planLegacyPurge,
  runLegacyPurgeCli,
} from './legacy-artifact-purge.js';
const slide = 'episodes/ep/localizations/ja/video/v1/hash/slides/01.png';
afterEach(() => vi.clearAllMocks());
it.each([
  [slide, 'slides'],
  ['episodes/ep/localizations/en/main/input.mp3', 'input'],
  ['episodes/ep/classroom/ja/input.mp3', 'input'],
  [`social/threads/${'a'.repeat(64)}/v1/video.mp4`, 'threads'],
  ['episodes/ep/main/playlist.m3u8', null],
  ['episodes/../main/input.mp3', null],
  ['episodes/ep/main/./input.mp3', null],
  [slide + '/extra', null],
  ['social/threads/invalid/v1/video.mp4', null],
])('classifies %s', (key, category) =>
  expect(classifyLegacyArtifact(key)).toBe(category),
);
it('sums only anchored candidates', () => {
  expect(
    planLegacyPurge([{ key: slide, size: 12, modified: undefined }])[0],
  ).toMatchObject({ count: 1, bytes: 12, keys: [slide] });
});
it.each([
  ['--unknown'],
  ['stray'],
  ['--apply', 'yes'],
  ['--dry-run', 'yes'],
  ['--apply', '--dry-run'],
  ['--apply'],
  ['--apply', '--max-objects', 'NaN'],
  ['--apply', '--max-objects', '-1'],
])('rejects invalid %j', async (...args) =>
  expect(runLegacyPurgeCli(args)).rejects.toThrow(),
);
it('dry-run lists unknown keys but never deletes', async () => {
  mocks.list
    .mockResolvedValueOnce([{ key: slide, size: 12 }])
    .mockResolvedValueOnce([{ key: 'social/threads/unknown', size: 10 }]);
  await runLegacyPurgeCli([]);
  expect(mocks.remove).not.toHaveBeenCalled();
});
it('caps deletion before mutating and applies an exact cap', async () => {
  mocks.list.mockResolvedValue([{ key: slide, size: 12 }]);
  await expect(
    runLegacyPurgeCli(['--apply', '--max-objects', '1']),
  ).rejects.toThrow('exceeds');
  expect(mocks.remove).not.toHaveBeenCalled();
  await runLegacyPurgeCli(['--apply', '--max-objects', '2']);
  expect(mocks.remove).toHaveBeenCalledWith('r2', 'bucket', [slide, slide]);
});
it('runs the main callback', async () => {
  vi.resetModules();
  mocks.main.mockReturnValue(true);
  mocks.list.mockResolvedValue([]);
  await import('./legacy-artifact-purge.js');
  const original = process.argv;
  process.argv = ['node', 'purge'];
  try {
    await mocks.cli.mock.calls[0]![0]();
    expect(mocks.list).toHaveBeenCalled();
  } finally {
    process.argv = original;
    mocks.main.mockReturnValue(false);
  }
});
