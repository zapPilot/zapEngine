# Local signing backup

From the repository root on the Mac that holds your signing keys:

```bash
pnpm signing:backup
```

The command collects Android release keystores and local credential/password
sidecars, Apple `.p12` / `.p8` files and provisioning profiles. It scans this
checkout, the primary checkout, `~/.android`, Apple API-key directories,
Downloads, Documents, Desktop and the two Xcode provisioning-profile directories.
It skips dependency/build caches, symlinks and Android's debug keystore. It also
exports Apple development/distribution and Developer ID signing identities,
including their private keys, individually from the accessible macOS keychains.
Keychain may ask you to allow private-key access. After five minutes the command
retains any completed exports and reports the remaining identities as incomplete. It never exports the whole
keychain or changes the original files.

The result is `.signing-backups/signing-backup-<timestamp>.zip`, with a restore
manifest and `RESTORE.md` inside. The directory is owner-only (`0700`), and the ZIP
and adjacent `.password.txt` are owner-only (`0600`). The password file protects
newly exported Apple p12 files; existing keystores/p12s keep their original
passwords. The ZIP itself is not encrypted. Save the ZIP and its adjacent password
file in your chosen private backup location. Git ignores the directory and these
archive/password names even when the output location is customized.

```bash
pnpm signing:backup --include /path/to/other/signing/material --output /private/backup/directory
```

Only signing-related environment variables already present in the invoking shell
are included; no Infisical or remote credential fetch runs. A local or base64
`CSC_LINK` / `MAC_CSC_LINK` is included, as is a local `APPLE_API_KEY` or inline
`APPLE_API_KEY_P8`. Unrelated environment secrets are excluded.

The command exits non-zero when it cannot prove all three platform identities
were collected, but retains a usable partial ZIP with the gaps in `manifest.json`.
A loose p12 may contain the missing identity; verify it and its original password
before relying on it. Hardware/non-exportable keys and credentials existing only
in EAS or a remote CI secret store cannot be collected locally. A notarytool
keychain-profile name is a reference, not a backup of the underlying authorization.
Android signing passwords absent from local credential files must be retained
separately. Play publisher service-account sidecars are included when found;
this is not a general GCP or system-keychain backup.
