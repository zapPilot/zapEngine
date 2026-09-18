# Podcast video downloads

Native iOS and Android save the existing MP4 and its thumbnail under
`Paths.document/podcast-videos`. Web reports that downloads are unsupported.
Only episodes with a video can be downloaded; the detail page explicitly labels
missing videos. Downloads contain main narration only, without language classrooms.

The manifest stores episode metadata and relative filenames, so cold starts do not
need a feed response or an authenticated session. File URIs are reconstructed from
the current document directory. The Downloaded section reads only this manifest.

Downloads are serialized, check both Content-Length headers against available disk
space (plus a 10 MiB reserve), and publish metadata only after both files and the
manifest write succeed. Failures and cancellation remove partial files. Cancellation
is available while downloading; retries start over. A force-kill during an unfinished
transfer does not publish a record; the next cold start removes its abandoned files before accepting new downloads.
Deleting a download removes its manifest entry before deleting the files, so a crash
cannot advertise a file that has already been removed.

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
