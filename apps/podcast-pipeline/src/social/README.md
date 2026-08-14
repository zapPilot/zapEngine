# Social Publisher MVP

Local-only social publishing for completed podcast episodes. It fetches the canonical `zh-Hant` assets from Supabase, generates Traditional Chinese platform copy through OpenRouter using the pipeline's `LLM_MODEL`, requires human review, then publishes to each platform through a locally authenticated browser session.

Copy generation deliberately does not use `openrouter/free`. That alias is a router: the same prompt was served by `poolside/laguna-s-2.1` and then by `nvidia/nemotron-nano-9b-v2`, whose answer mixed Simplified Chinese and Spanish into publishable copy. Because the model can change per request, a `--dry-run` preview said nothing about what a real publish would produce.

Every published field is then normalized through the same OpenCC converter that ingest uses (`convertTextToZhTW`), so Simplified output becomes Taiwan Traditional instead of failing the run. Lengths are measured after conversion. What OpenCC cannot fix — drift into another language — is rejected: accented Latin letters, and copy that is more than 35% Latin letters overall.

- X receives short copy plus the episode share URL, published with the OpenCLI `twitter post` adapter command. The URL renders the episode's OG card and thumbnail.
- Rednote / 小紅書 receives the completed MP4 plus title, body, and hashtags, published with Playwright driving the system Chrome.

X video upload is intentionally excluded. The non-Premium account limit is 140 seconds, while the production episodes measured for this MVP are 173–1188 seconds. The publisher does not create shortened videos.

### Why the two platforms use different automation

Rednote needs a local file on a file input. The OpenCLI Chrome bridge cannot do that: `DOM.setFileInputFiles` returns CDP `{"code":-32000,"message":"Not allowed"}`, and this reproduces on a visible input on an unrelated page, so it is a limitation of the extension's debugger permissions rather than anything about Rednote. OpenCLI's `rednote` adapter is read-only (feed/note/search/login) and has no publish command. Playwright has no such restriction, so Rednote runs there while X stays on the adapter command, which needs no file upload at all.

Rednote also has a regional gate: use `creator.rednote.com`, since `creator.xiaohongshu.com` redirects to a login wall from outside mainland China.

This tool is not deployed with the podcast service. It does not add Telegram callbacks, polling, scheduling, analytics, a social jobs table, or server-side workers.

## Prerequisites

The repository root `.env` must contain the existing podcast credentials:

```bash
OPENROUTER_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

**X** uses OpenCLI. Install it on the Mac, connect its Chrome extension, then verify the adapter session:

```bash
opencli twitter whoami
```

If it is not logged in, run `opencli twitter login`.

**Rednote** uses its own Chrome profile at `~/.zap-pilot/rednote-chrome-profile`, kept separate because the everyday Chrome profile is locked while Chrome runs. Log in there once — the session persists in that profile afterwards:

```bash
pnpm social:rednote-login
```

That opens Chrome on the creator page and waits until the upload input appears, which is what proves the session is authenticated (the site serves its login form at the publish URL itself, so the URL alone proves nothing). The publisher never sees or stores account passwords.

## The normal run

Telegram says an episode is done. Copy its share URL from that message and:

```bash
pnpm social:publish '<share-url>' --dry-run   # read the copy first
pnpm social:publish '<share-url>'             # then a / x / r at the prompt
```

That is the whole workflow. This is a plain Node CLI — it does not depend on Claude Code, opencode, or any agent; Playwright is a library inside the same process. The review prompt reads the keyboard, so run it in a terminal. An agent driving it unattended needs a real pty (`expect`); a plain pipe trips the TTY check.

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

# Explicitly allow a duplicate publish
pnpm social:publish <uuid-or-share-url> --force
```

Publishing always uses the canonical `zh-Hant` localization — there is no language flag. Missing or incomplete Chinese localization/video data is a hard failure; the tool never falls back to Japanese or English.

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

The business layer depends only on `BrowserPublisher`, which the CLI composes from an `XPublisher` and a `RednotePublisher`. X uses the first-class `opencli twitter post` command and records the returned post URL when OpenCLI can resolve it. A confirmed success is still saved when OpenCLI cannot resolve that optional URL, preventing a duplicate retry after a live post. Rednote uses Playwright against its own Chrome profile. Failures on either side retain the platform and named step, for example:

```text
REDNOTE_PUBLISH_FAILED
Step: fill_title
Cause: ...
```

CI mocks `BrowserPublisher`; it never publishes to real accounts.

## Local smoke test

Use a completed episode URL from Telegram and run these in order:

1. Confirm `opencli twitter whoami` is logged in, and run `pnpm social:rednote-login` once.
2. Run `pnpm social:publish '<share-url>' --dry-run`; inspect resolution, copy quality, weighted X length, the exact appended URL, duration, and file size.
3. Run `pnpm social:publish '<share-url>' --platform x`; confirm the post and OG card, then rerun it to confirm local duplicate detection.
4. Run `pnpm social:publish '<share-url>' --platform rednote`. Every selector in `rednote-playwright.ts` was calibrated against the live creator page on 2026-08-12; if the UI changes, the reported `REDNOTE_PUBLISH_FAILED` step names what to re-check, and only the failed platform is retried.

   What that calibration found, so it is not rediscovered the hard way:
   - Submitting goes through `<xhs-publish-btn>`, a custom element whose label is an **attribute** (`submit-text="发布"`) and whose buttons sit in a **closed** shadow root — no text or CSS selector reaches them until `attachShadow` is forced open (see `rednote-browser.ts`). The host's own centre lands in the gap between its two buttons, so clicking the host is a no-op.
   - `submit-disabled` on that host is the only trustworthy enabled check; the button is never `disabled`, just styled differently.
   - Typing `#` opens the topic suggestion panel, which **disables submit** until dismissed with `Escape`. An empty form is publishable; filling the body is what blocks it.
   - `setInputFiles` returns long before the upload finishes. `重新上传` replacing `取消上传` is the completion signal (~10 s for 33 MB).
   - The title must be written **after** the body and read back. Filling it first published a note with an empty title, and the platform accepted that silently.
   - Video notes land in `审核中` (under review), so they do not appear in public feeds immediately — check 笔记管理 in the creator site, not the public profile.
5. On the next episode, run the full two-platform flow and confirm a partial failure rerun only fills the missing platform.

Because the review step needs a TTY, driving the CLI non-interactively (for example from an agent) requires a real pty — `expect` works; a plain pipe does not.
