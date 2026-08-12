# Social Publisher MVP

Local-only social publishing for completed podcast episodes. It fetches the canonical `zh-Hant` assets from Supabase, generates Traditional Chinese platform copy through OpenRouter's free router, requires human review, then publishes through the locally authenticated OpenCLI session.

- X receives short copy plus the episode share URL. The URL renders the episode's OG card and thumbnail.
- Rednote / 小紅書 receives the completed MP4 plus title, body, and hashtags.

X video upload is intentionally excluded. The non-Premium account limit is 140 seconds, while the production episodes measured for this MVP are 173–1188 seconds. The publisher does not create shortened videos.

This tool is not deployed with the podcast service. It does not add Telegram callbacks, polling, scheduling, analytics, a social jobs table, or server-side workers.

## Prerequisites

The repository root `.env` must contain the existing podcast credentials:

```bash
OPENROUTER_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Install OpenCLI on the Mac, connect its Chrome extension, log into both services in that Chrome profile, then verify the actual adapter sessions:

```bash
opencli twitter whoami
opencli rednote whoami
```

If either command is not logged in, run `opencli twitter login` or `opencli rednote login`. The publisher never stores account passwords.

## Usage

The positional input can be either a bare episode UUID or the complete share URL copied from Telegram:

```bash
# Normal review + publish flow
pnpm social:publish 123e4567-e89b-42d3-a456-426614174000
pnpm social:publish 'https://from-fed-to-chain-api.fly.dev/e/123e4567-e89b-42d3-a456-426614174000?lang=zh-Hant'

# Generate and preview only; never publishes
pnpm social:publish <uuid-or-share-url> --dry-run

# One platform; X-only runs do not download the MP4
pnpm social:publish <uuid-or-share-url> --platform x
pnpm social:publish <uuid-or-share-url> --platform rednote

# Chinese canonical localization (the only MVP language)
pnpm social:publish <uuid-or-share-url> --lang zh

# Explicitly allow a duplicate publish
pnpm social:publish <uuid-or-share-url> --force
```

`--lang zh` maps only to `zh-Hant`. Missing or incomplete Chinese localization/video data is a hard failure; the tool never falls back to Japanese or English.

## Copy and review

Editorial assets live in `prompts/social/`, alongside the pipeline's other LLM prompt assets. The generated X text is limited to 250 weighted units before the automatically appended blank line and 23-unit URL (`CJK = 2`, other characters `= 1`). The copy itself may not contain a URL.

The preview shows the exact X text plus share link. The Rednote preview shows the MP4 duration and downloaded size. A video over 15 minutes produces a warning before Rednote publishing but is still submitted so the platform response remains authoritative.

```text
[a] Publish all  [x] X only  [r] Rednote only  [g] Regenerate  [e] Edit  [q] Quit
```

`g` accepts optional feedback for the next OpenRouter generation. `e` opens the generated JSON with `$EDITOR` (or `vi`) and validates it again before publishing.

## Duplicate and partial failure behavior

Successful publishes are recorded immediately at:

```text
~/.zap-pilot/social-publisher.json
```

If X succeeds and Rednote fails, the next run skips X and offers to retry Rednote. `--force` is required to publish a platform already recorded as successful.

The business layer depends only on `BrowserPublisher`. X uses the first-class `opencli twitter post` command and records the returned post URL when OpenCLI can resolve it. A confirmed success is still saved when OpenCLI cannot resolve that optional URL, preventing a duplicate retry after a live post. Rednote uses `opencli browser` primitives for the local MP4 upload and editor. Browser failures retain the platform and named step, for example:

```text
REDNOTE_PUBLISH_FAILED
Step: fill_title
Cause: ...
```

CI mocks `BrowserPublisher`; it never publishes to real accounts.

## Local smoke test

Use a completed episode URL from Telegram and run these in order:

1. Confirm `opencli twitter whoami` and `opencli rednote whoami` are logged in.
2. Run `pnpm social:publish '<share-url>' --dry-run`; inspect resolution, copy quality, weighted X length, the exact appended URL, duration, and file size.
3. Run `pnpm social:publish '<share-url>' --platform x`; confirm the post and OG card, then rerun it to confirm local duplicate detection.
4. Run `pnpm social:publish '<share-url>' --platform rednote`. If the creator UI has changed, use the reported `REDNOTE_PUBLISH_FAILED` step to calibrate the selector list in `opencli.ts` and retry only the failed platform.
5. On the next episode, run the full two-platform flow and confirm a partial failure rerun only fills the missing platform.
