import type { PodcastMediaFiles } from './podcastMediaFiles.types';
function unsupported(): never {
  throw new Error('Offline video downloads require iOS or Android.');
}
const podcastMediaFiles: PodcastMediaFiles = {
  isSupported: false,
  ensureDirectory: async () => unsupported(),
  download: async () => unsupported(),
  localUri: unsupported,
  remove: async () => unsupported(),
  availableBytes: async () => unsupported(),
};
export default podcastMediaFiles;
