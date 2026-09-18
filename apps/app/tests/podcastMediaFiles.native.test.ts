import { beforeEach, describe, expect, it, vi } from 'vitest';
import { File, Directory } from 'expo-file-system';
import files from '@/downloads/podcastMediaFiles.native';
const native = vi.hoisted(() => ({
  create: vi.fn(),
  list: vi.fn<() => unknown[]>(() => []),
  remove: vi.fn(),
  start: vi.fn(),
  release: vi.fn(),
  task: vi.fn(),
  exists: true,
}));
vi.mock('expo-file-system', () => ({
  Paths: { document: 'file:///documents', availableDiskSpace: 500 },
  Directory: class {
    uri = 'file:///documents/podcast-videos';
    create = native.create;
    list = native.list;
  },
  File: class {
    uri: string;
    name: string;
    exists = native.exists;
    delete = native.remove;
    constructor(directory: { uri: string }, name: string) {
      this.uri = `${directory.uri}/${name}`;
      this.name = name;
    }
    static createDownloadTask = native.task;
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  native.exists = true;
  native.list.mockReturnValue([]);
  native.start.mockResolvedValue({ size: 100 });
  native.task.mockReturnValue({
    downloadAsync: native.start,
    release: native.release,
  });
});
describe('native media files', () => {
  it('cleans abandoned files at hydration without deleting committed media', async () => {
    const directory = new Directory('file:///documents');
    native.list.mockReturnValue([
      new File(directory, 'episode-keep.mp4'),
      new File(directory, 'episode-orphan.mp4'),
    ]);
    await files.ensureDirectory(['episode-keep.mp4']);
    expect(native.remove).toHaveBeenCalledOnce();
    native.remove.mockClear();
    await files.ensureDirectory();
    expect(native.remove).not.toHaveBeenCalled();
  });
  it('uses durable document files, disk space and SDK 57 progress', async () => {
    await files.ensureDirectory();
    expect(native.create).toHaveBeenCalledWith({
      intermediates: true,
      idempotent: true,
    });
    expect(await files.availableBytes()).toBe(500);
    const signal = new AbortController().signal;
    const onProgress = vi.fn();
    expect(
      await files.download('https://example.com/video.mp4', 'episode-1.mp4', {
        signal,
        onProgress,
      }),
    ).toBe(100);
    const options = native.task.mock.calls[0]![2];
    expect(options).toMatchObject({ signal, sessionType: 'foreground' });
    options.onProgress({
      bytesWritten: 50,
      totalBytes: 100,
    });
    options.onProgress({
      bytesWritten: 50,
      totalBytes: -1,
    });
    expect(onProgress.mock.calls).toEqual([[0.5], [0]]);
    expect(native.release).toHaveBeenCalledOnce();
    expect(files.localUri('episode-1.jpg')).toBe(
      'file:///documents/podcast-videos/episode-1.jpg',
    );
  });
  it.each([null, { size: 0 }])(
    'rejects incomplete result %s and releases task',
    async (result) => {
      native.start.mockResolvedValue(result);
      await expect(
        files.download('url', 'episode-1.mp4', {
          signal: new AbortController().signal,
          onProgress: vi.fn(),
        }),
      ).rejects.toThrow('empty');
      expect(native.release).toHaveBeenCalledOnce();
    },
  );
  it('releases failed transfers and deletes files idempotently', async () => {
    native.start.mockRejectedValue(new Error('network'));
    await expect(
      files.download('url', 'episode-1.mp4', {
        signal: new AbortController().signal,
        onProgress: vi.fn(),
      }),
    ).rejects.toThrow('network');
    expect(native.release).toHaveBeenCalledOnce();
    await files.remove('episode-1.mp4');
    native.exists = false;
    await files.remove('episode-1.mp4');
    expect(native.remove).toHaveBeenCalledOnce();
  });
  it.each([
    '../secret.mp4',
    'episode-x/../secret.mp4',
    'episode-%2Fsecret.mp4',
    'file:///secret',
  ])('rejects unsafe filenames %s', (name) =>
    expect(() => files.localUri(name)).toThrow('Invalid'),
  );
});
