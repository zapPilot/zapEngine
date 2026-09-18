import appKeyValueStorage from './appKeyValueStorage';
import { createPodcastDownloadStorage } from './podcastDownloadStorageCore';
export default createPodcastDownloadStorage(appKeyValueStorage);
