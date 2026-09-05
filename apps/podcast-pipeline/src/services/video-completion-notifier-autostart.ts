import { createVideoCompletionNotifier } from './video-completion-notifier.js';

// Loaded only by the always-on Fly `app` process (see fly.toml). Keeping this
// retry loop off the expensive on-demand render machine means a Telegram outage
// cannot strand a completed notification after the render worker idles out.
createVideoCompletionNotifier().start();
