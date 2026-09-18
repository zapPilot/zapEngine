import { Directory, File, Paths } from 'expo-file-system';
import type { PodcastMediaFiles } from './podcastMediaFiles.types';

const directory = new Directory(Paths.document, 'podcast-videos');
function mediaFile(fileName: string): File {
  if (!/^episode-[a-zA-Z0-9_.!'()*~-]+\.(mp4|jpg)$/.test(fileName))
    throw new Error('Invalid media file name');
  return new File(directory, fileName);
}
const podcastMediaFiles: PodcastMediaFiles = {
  isSupported: true,
  async ensureDirectory(keepFileNames) {
    directory.create({ intermediates: true, idempotent: true });
    if (keepFileNames !== undefined) {
      const keep = new Set(keepFileNames);
      for (const entry of directory.list()) {
        if (entry instanceof File && !keep.has(entry.name)) entry.delete();
      }
    }
  },
  localUri: (fileName) => mediaFile(fileName).uri,
  async availableBytes() {
    return Paths.availableDiskSpace;
  },
  async remove(fileName) {
    const file = mediaFile(fileName);
    if (file.exists) file.delete();
  },
  async download(url, fileName, { onProgress, signal }) {
    const task = File.createDownloadTask(url, mediaFile(fileName), {
      signal,
      sessionType: 'foreground',
      onProgress: ({ bytesWritten, totalBytes }) => {
        onProgress(totalBytes > 0 ? bytesWritten / totalBytes : 0);
      },
    });
    try {
      const result = await task.downloadAsync();
      if (result === null || result.size <= 0)
        throw new Error('Downloaded file is empty');
      return result.size;
    } finally {
      task.release();
    }
  },
};
export default podcastMediaFiles;
