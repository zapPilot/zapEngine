# Podcast video downloads

Native iOS and Android save the existing MP4 and its thumbnail under
`Paths.document/podcast-videos`. Web reports that downloads are unsupported.
Only episodes with a video can be downloaded; the detail page explicitly labels
missing videos. Downloads contain main narration only, without language classrooms.

The manifest stores episode metadata and relative filenames, so cold starts do not
need a feed response or an authenticated session. File URIs are reconstructed from
the current document directory. The Downloads shelf needs no feed: saved videos come
from this manifest, and a running download carries its own title, cover and length in
the provider's state, so it shows even for an episode no loaded feed page contains.

Downloads are serialized, check both Content-Length headers against available disk
space (plus a 10 MiB reserve), and publish metadata only after both files and the
manifest write succeed. Failures and cancellation remove partial files. Cancellation
is available while downloading and returns the episode to idle (it is not reported
as a failure); retries start over. A force-kill during an unfinished
transfer does not publish a record; the next cold start removes its abandoned files before accepting new downloads.
Deleting a download removes its manifest entry before deleting the files, so a crash
cannot advertise a file that has already been removed.

## Interface

`describeEpisodeDownload` (`src/integration/podcastVideoDownloads.ts`) collapses the
provider's facts into one phase per episode, which every download control reads:
`unsupported`, `unavailable` (no video), `idle`, `downloading`, `downloaded`, `failed`.

- **Episode page.** The header button is a 44px circle that lines up with Back and
  Share and carries the phase in its look: download arrow, a progress ring around a
  cancel mark while downloading, a green check once saved, a red retry mark after a
  failure, and a dimmed arrow where a download is impossible. A status badge in the
  hero card says the same in words (saved size, percent, failure reason, or why the
  download is impossible). Tapping the check asks before removing the video.
- **Podcast screen.** The Downloads shelf shows running downloads first (progress
  bar plus cancel), then saved videos with thumbnail, duration, date and size, a
  total in the header and a remove action that asks first. An empty shelf invites the
  first download. The shelf is hidden on platforms that cannot download.

## Accepted limitations and follow-up

- The product decision accepts video availability for only 412/948 episodes in the
  supplied production snapshot (43%), roughly 69 MB per downloaded episode, and no
  offline language classroom. Availability and sizes vary with subsequent episodes.
- Files deliberately live in Documents rather than an OS-evictable cache. Expo File
  System 57 does not expose an iCloud backup exclusion API. These redownloadable files
  are therefore currently eligible for backup. **Before an App Store release, track
  backup exclusion explicitly**: a small native/config plugin setting
  `NSURLIsExcludedFromBackupKey`, or a future supported Expo API, is still required.
- Transfers restart after cancellation or interruption; persistent transfer resumption
  is not implemented.
- This implementation changes no pipeline endpoint, R2 data, database schema, shared
  type package, or environment variable contract.

PR #593 remains a handoff-only draft. Its handoff document is not part of this
implementation; the user decides whether to close that draft without merging it.
