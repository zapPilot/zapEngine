import { startPodcastReleaseHeartbeat } from './services/podcast-release-heartbeat.js';

// Top-level await is deliberate: Fly must not mark the app healthy until the
// release capability is visible to the retry guard in Supabase.
await startPodcastReleaseHeartbeat();
