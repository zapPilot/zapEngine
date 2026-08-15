# Social Publisher MVP

Local-only social publishing for completed podcast episodes. It fetches the canonical `zh-Hant` assets from Supabase, generates Traditional Chinese platform copy through OpenRouter using the pipeline's `LLM_MODEL`, requires human review, then publishes through platform adapters. X and Rednote use local browser automation; Threads uses Meta's HTTP API.

Copy generation deliberately does not use `openrouter/free`. That alias is a router: the same prompt was served by `poolside/laguna-s-2.1` and then by `nvidia/nemotron-nano-9b-v2`, whose answer mixed Simplified Chinese and Spanish into publishable copy. Because the model can change per request, a `--dry-run` preview said nothing about what a real publish would produce.

Every published field is then normalized through the same OpenCC converter that ingest uses (`convertTextToZhTW`), so Simplified output becomes Taiwan Traditional instead of failing the run. Lengths are measured after conversion. What OpenCC cannot fix — drift into another language — is rejected: accented Latin letters, and copy that is more than 35% Latin letters overall.

- X receives short copy plus the episode share URL, published with the OpenCLI `twitter post` adapter command. The URL renders the episode's OG card and thumbnail.
- Threads reuses the reviewed X short copy and sends one `TEXT` publish request with `auto_publish_text=true`, attaching the episode URL through `link_attachment`. It does not upload the episode video.
- Rednote / 小紅書 receives the completed MP4 plus title, body, and hashtags, published with Playwright driving the system Chrome.

X video upload is intentionally excluded. The non-Premium account limit is 140 seconds, while the production episodes measured for this MVP are 173–1188 seconds. The publisher does not create shortened videos.

### Why the platforms use different adapters

Rednote needs a local file on a file input. The OpenCLI Chrome bridge cannot do that: `DOM.setFileInputFiles` returns CDP `{"code":-32000,"message":"Not allowed"}`, and this reproduces on a visible input on an unrelated page, so it is a limitation of the extension's debugger permissions rather than anything about Rednote. OpenCLI's `rednote` adapter is read-only (feed/note/search/login) and has no publish command. Playwright has no such restriction, so Rednote runs there while X stays on the adapter command, which needs no file upload at all.

Rednote also has a regional gate: use `creator.rednote.com`, since `creator.xiaohongshu.com` redirects to a login wall from outside mainland China.

This tool is not deployed with the podcast service. It does not add Telegram callbacks, polling, scheduling, automated metrics collection, an analytics dashboard, a social jobs table, or server-side workers.

## Prerequisites

The repository root `.env` must contain the existing podcast credentials plus the Meta Threads app configuration:

```bash
OPENROUTER_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
THREADS_APP_ID=...
THREADS_APP_SECRET=...
THREADS_ACCESS_TOKEN=...
```

`THREADS_APP_ID` and `THREADS_APP_SECRET` are the **Threads** credentials in App settings → Basic, not the Meta app id and secret shown above them on the same page.

`THREADS_ACCESS_TOKEN` is the long-lived Threads Tester token issued by the App Dashboard's **User Token Generator**. `social:login` validates it through Meta's token debugger — both required permissions and its expiry — then stores the session outside the repository at `~/.zap-pilot/threads-session.json` with file mode `0600`. The token is never printed.

### One-time Threads setup

1. In [Meta for Developers](https://developers.facebook.com/apps/), create an app with the **Threads API** use case.
2. Under the use case's **Permissions and features**, add `threads_content_publish` (`threads_basic` is granted with the use case).
3. Add the publishing account under App roles → Roles → **More → Threads Testers**, then accept the invitation as that account in Threads under Settings → Account → **Website permissions**. The account stays `Pending` and cannot generate a token until the invitation is accepted.
4. In the use case's **Settings**, use **User Token Generator** to generate a token for that account and put it in the repository root `.env` as `THREADS_ACCESS_TOKEN`. Do not commit it.

### OAuth instead of a Tester token

Leaving `THREADS_ACCESS_TOKEN` unset makes `social:login` run the OAuth authorization flow, which additionally needs `THREADS_REDIRECT_URI`, `THREADS_TLS_CERT_PATH`, and `THREADS_TLS_KEY_PATH`, plus a redirect callback URL registered on the Meta app that matches `THREADS_REDIRECT_URI` exactly — scheme, hostname, port, path, and no trailing slash. The App Dashboard's Threads settings form does not currently persist one: it omits the field from its save request and that request returns 404, so this flow is unusable until Meta fixes it.

The local HTTPS callback then needs:

1. [mkcert](https://github.com/FiloSottile/mkcert) installed, its local CA trusted once, and a certificate for the callback hostname. For example:

   ```bash
   brew install mkcert
   mkcert -install
   mkdir -p ~/.zap-pilot/threads-tls
   mkcert \
     -cert-file ~/.zap-pilot/threads-tls/threads-local.test.pem \
     -key-file ~/.zap-pilot/threads-tls/threads-local.test-key.pem \
     threads-local.test
   ```

2. This hostname mapping in `/etc/hosts` (editing that file requires administrator access):

   ```text
   127.0.0.1 threads-local.test
   ```

3. The exact redirect URI and the **absolute** certificate/key paths in the repository root `.env`. Do not commit the TLS private key.

Meta requires an HTTPS redirect and does not support `localhost` as the redirect hostname. The CLI validates this setup and explains missing configuration, but deliberately does not create a Meta app, edit `/etc/hosts`, install a local CA, or generate certificates.

**X** uses OpenCLI, **Threads** uses the Threads HTTP API, and **Rednote** uses a dedicated Chrome profile at `~/.zap-pilot/rednote-chrome-profile`. After OpenCLI is installed and its Chrome extension is connected, use one command for all session checks:

```bash
pnpm social:login
```

The command skips platforms that are already ready. If X is logged out it starts `opencli twitter login`; if Rednote is logged out it opens the creator page and waits for login. For Threads it validates the saved token and both required permissions, and refreshes a token within seven days of expiry. When no usable session exists it adopts `THREADS_ACCESS_TOKEN`, or falls back to OAuth when that variable is unset — the local callback then accepts only the configured path and matching OAuth `state`, and stops waiting after five minutes.

Either way the CLI verifies the token and permissions through Meta's token debugger, then resolves the account through `/me`. A token that can read the profile but lacks `threads_content_publish` is not reported as ready.

## The normal run

The public workflow has three commands. Run login whenever a platform session needs attention, publish a completed episode, then record that post's numbers whenever you check them:

```bash
pnpm social:login
pnpm social:publish '<share-url>'
pnpm social:metrics '<share-url>' --platform x --views 1200 --likes 18
```

Copy the share URL from Telegram when an episode is done. The publish command generates a preview and waits for `a` / `x` / `t` / `r` at the review prompt. Use `--dry-run` when a non-publishing preview is useful. This is a plain Node CLI — it does not depend on Claude Code, opencode, or any agent; Playwright is a library inside the same process. The review prompt reads the keyboard, so run it in a terminal. An agent driving it unattended needs a real pty (`expect`); a plain pipe trips the TTY check.

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
pnpm social:publish <uuid-or-share-url> --platform threads
pnpm social:publish <uuid-or-share-url> --platform rednote

# Explicitly allow a duplicate publish
pnpm social:publish <uuid-or-share-url> --force
```

Publishing always uses the canonical `zh-Hant` localization — there is no language flag. Missing or incomplete Chinese localization/video data is a hard failure; the tool never falls back to Japanese or English.

## Copy and review

Editorial assets live in `prompts/social/`, alongside the pipeline's other LLM prompt assets. The generated X text is limited to 250 weighted units before the automatically appended blank line and 23-unit URL (`CJK = 2`, other characters `= 1`). The copy itself may not contain a URL.

The preview shows the exact X text plus share link and the Threads text plus attached link. The Rednote preview shows the MP4 duration and downloaded size. A video over 15 minutes produces a warning before Rednote publishing but is still submitted so the platform response remains authoritative.

```text
[a] Publish all  [x] X only  [t] Threads only  [r] Rednote only  [g] Regenerate  [e] Edit  [q] Quit
```

`g` accepts optional feedback for the next OpenRouter generation. `e` opens the generated JSON with `$EDITOR` (or `vi`) and validates it again before publishing.

## Duplicate and partial failure behavior

Successful publishes are recorded immediately at:

```text
~/.zap-pilot/social-publisher.json
```

If one platform succeeds and another fails, the next run skips the successful platform and offers to retry only the missing ones. `--force` is required to publish a platform already recorded as successful.

The orchestration layer receives ordered `SocialPublishJob` values, each carrying its platform and publish operation, so duplicate handling/state persistence has no platform-specific branches or parallel platform/publisher lists that can drift apart. `publishers.ts` builds those jobs from the X, Threads, and Rednote adapters. X uses the first-class `opencli twitter post` command and records the returned post URL when OpenCLI can resolve it. Threads uses the official text auto-publish flow. Rednote uses Playwright against its own Chrome profile. Failures retain the platform and named step, for example:

```text
REDNOTE_PUBLISH_FAILED
Step: fill_title
Cause: ...
```

CI mocks publish jobs/adapters and the Threads HTTP client; it never publishes to real accounts.

## Publish telemetry

Apply `supabase/migrations/025_add_social_posts.sql` to the production Supabase schema **before** running this version of the publisher. Apply it manually through the Supabase dashboard SQL editor or an authorized Supabase MCP connection; publishing code and the database schema must not be deployed in the opposite order.

On the normal completed path, every successfully published platform gets one `from_fed_to_chain.social_posts` row. The row records the episode and platform, the last AI-generated copy, the human-reviewed copy that actually went out, the generating model, `topic` / `hook_type`, deterministic content features, hashtags, video duration where applicable, and the platform publish time. The taxonomy is generated in the same OpenRouter request as the copy; features such as character counts and whether the final copy contains a question or number are calculated after review, so manual edits are represented accurately.

Post identity follows what each adapter can verify:

- X stores the validated status URL and numeric status ID when OpenCLI returns either form. Both identity fields remain `NULL` when OpenCLI confirms success but returns neither a validated URL nor a numeric ID.
- Threads stores the post ID returned by Meta. It does not make another API request to resolve a permalink.
- Rednote stores neither a public URL nor an ID. Creator redirects and note-manager URLs are deliberately not treated as public post identity.

The local `~/.zap-pilot/social-publisher.json` file remains the duplicate-publish guard. For each platform the publisher confirms the remote post, attempts to save local state, then attempts the telemetry insert. Either persistence failure is reported without reclassifying the live post as a platform failure, and later platforms still run.

If telemetry alone fails, local state still prevents a duplicate; the CLI exits with status 1 and prints the exact snake-case insert payload for manual recovery. If the local state write fails, telemetry is still attempted, but the CLI warns that the duplicate guard was **not** saved. Verify the live platform post and repair `social-publisher.json` before rerunning, or the same post may be published again. If both writes fail, both recovery warnings and the telemetry payload are preserved.

An abrupt process exit has two distinct recovery windows. If it exits after remote success but before local state, the live post can have no duplicate guard, database row, or printed recovery payload, so a blind rerun risks a duplicate. If it exits after local state succeeds but before telemetry completes, reruns will skip the post while its database row may be silently missing. This local CLI deliberately has no transactional outbox: after an unexplained interruption, verify the platform account and inspect both `social-publisher.json` and `social_posts` before deciding whether to repair or rerun.

## Metrics entry

`social:metrics` appends one `from_fed_to_chain.social_post_metrics` snapshot per run, from numbers read off each platform's own analytics page. There is no scraper; every value is typed by hand.

```bash
pnpm social:metrics '<share-url>' --platform x \
  --views 1200 --likes 18 --comments 2 --shares 1 --profile-visits 9
```

The positional input accepts the same bare UUID or share URL as `social:publish`, and `--platform` selects which of that episode's posts the snapshot belongs to. The table deliberately allows an episode to be published to the same platform more than once; when that has happened the command refuses to guess and lists the candidate ids for `--post-id`.

The available metrics are `--views`, `--impressions`, `--likes`, `--comments`, `--shares`, `--saves`, `--profile-visits`, and `--followers-gained`. Pass only the ones that platform actually reports. An omitted metric is stored as `NULL`, which stays distinguishable from a measured `0` — the analysis reading these rows must be able to tell "the platform does not expose this" from "nobody did this". A run with no metrics at all is rejected rather than writing an empty snapshot.

`--followers-gained` is a net delta and may be negative, which needs the equals form (`--followers-gained=-3`); Node's argument parser reads a dash-leading value as another flag. Every other metric must be a non-negative whole number.

`age_hours` is computed from the stored `published_at` rather than entered, so repeated snapshots of the same post stay comparable. Because the row is append-only, taking a second reading later is a normal second run, not a correction — nothing is overwritten.

Reading these rows back — analysis, weekly reports, dashboards, automated collection, and prompt optimization — remains follow-up work.

## Local smoke test

Use a completed episode URL from Telegram and run these in order:

1. Run `pnpm social:login`; confirm X, Threads, and Rednote all report ready.
2. Run `pnpm social:publish '<share-url>' --dry-run`; inspect resolution, copy quality, weighted X length, the exact appended URL, duration, and file size.
3. Run `pnpm social:publish '<share-url>' --platform x`; confirm the post and OG card, then rerun it to confirm local duplicate detection.
4. Run `pnpm social:publish '<share-url>' --platform threads`; confirm the text and link attachment, then rerun it to confirm local duplicate detection.
5. Run `pnpm social:publish '<share-url>' --platform rednote`. Every selector in `rednote-playwright.ts` was calibrated against the live creator page on 2026-08-12; if the UI changes, the reported `REDNOTE_PUBLISH_FAILED` step names what to re-check, and only the failed platform is retried.

   What that calibration found, so it is not rediscovered the hard way:
   - Submitting goes through `<xhs-publish-btn>`, a custom element whose label is an **attribute** (`submit-text="发布"`) and whose buttons sit in a **closed** shadow root — no text or CSS selector reaches them until `attachShadow` is forced open (see `rednote-browser.ts`). The host's own centre lands in the gap between its two buttons, so clicking the host is a no-op.
   - `submit-disabled` on that host is the only trustworthy enabled check; the button is never `disabled`, just styled differently.
   - Typing `#` opens the topic suggestion panel, which **disables submit** until dismissed with `Escape`. An empty form is publishable; filling the body is what blocks it.
   - `setInputFiles` returns long before the upload finishes. `重新上传` replacing `取消上传` is the completion signal (~10 s for 33 MB).
   - The title must be written **after** the body and read back. Filling it first published a note with an empty title, and the platform accepted that silently.
   - Video notes land in `审核中` (under review), so they do not appear in public feeds immediately — check 笔记管理 in the creator site, not the public profile.

6. On the next episode, run the full three-platform flow and confirm a partial failure rerun only fills the missing platform.

Because the review step needs a TTY, driving the CLI non-interactively (for example from an agent) requires a real pty — `expect` works; a plain pipe does not.
