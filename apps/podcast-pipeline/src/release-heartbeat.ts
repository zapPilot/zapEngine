import { startPodcastReleaseHeartbeat } from './services/podcast-release-heartbeat.js';

// Preload before the API so the compatibility observer begins with the app
// process itself. A rollout may still wait for the render Machine to reach the
// same image; until then no heartbeat is published and retries fail closed.
await startPodcastReleaseHeartbeat();
