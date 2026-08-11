# Social Publisher MVP

Local-only social publishing for completed podcast episodes. It fetches the canonical `zh-Hant` episode assets from Supabase, downloads the completed MP4 to `/tmp/zap-pilot-social`, generates platform-native copy through OpenRouter, requires human review, then drives the logged-in Chrome session through OpenCLI.

It is deliberately not deployed with the podcast service and does not add Telegram callbacks, polling, scheduling, analytics, a social jobs table, or server-side workers.

## Prerequisites

The repository root `.env` must contain the existing podcast credentials:

```bash
OPENROUTER_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```bash
SOCIAL_OPENROUTER_MODEL=openrouter/free
```

Install OpenCLI on the Mac, connect its Chrome extension, log into X and Xiaohongshu in that Chrome profile, then verify:

```bash
opencli doctor
```

The publisher never stores X or Xiaohongshu passwords.

## Usage

```bash
# Normal review + publish flow
pnpm social:publish <episode-id>

# Generate and preview only; never opens a browser
pnpm social:publish <episode-id> --dry-run

# One platform
pnpm social:publish <episode-id> --platform x
pnpm social:publish <episode-id> --platform rednote

# Chinese canonical video (the only MVP language)
pnpm social:publish <episode-id> --lang zh

# Explicitly allow a duplicate publish
pnpm social:publish <episode-id> --force
```

`--lang zh` maps only to `zh-Hant`. Missing/incomplete Chinese localization or video is a hard failure; it never falls back to Japanese or English.

## Review flow

The CLI prints the X and Rednote drafts before any publish action:

```text
[a] Publish all  [x] X only  [r] Rednote only  [g] Regenerate  [e] Edit  [q] Quit
```

`g` accepts optional feedback for the next OpenRouter generation. `e` opens the generated JSON in `$EDITOR` (default `vi`) and validates it again before it can be published.

## Duplicate and partial failure behavior

Successful publishes are recorded locally at:

```text
~/.zap-pilot/social-publisher.json
```

State is written immediately after each platform succeeds. If X succeeds and Rednote fails, a later run skips X and offers to retry Rednote. `--force` is required to publish a platform that is already recorded as successful.

## Browser automation

The business layer depends only on `BrowserPublisher`. `createOpenCliBrowserPublisher()` is the MVP implementation and shells out to `opencli browser` primitives because the publishing flow needs local MP4 upload and explicit upload-complete/success checks.

X waits for a video preview and an enabled Post button before submitting. Rednote waits for the post-upload title/body editor before filling content. Browser failures include the platform and named step, for example:

```text
REDNOTE_PUBLISH_FAILED
Step: fill_title
Cause: ...
```

CI tests mock `BrowserPublisher`; they never publish to real social accounts.
