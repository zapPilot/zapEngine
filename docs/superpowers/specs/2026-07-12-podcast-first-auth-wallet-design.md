# Podcast-first entry and approved-wallet design

## Goal

Make Podcast the consistent entry point on web, desktop, iOS, and Android while keeping identity prompts contextual and restricting investment wallet choices to Zap Pilot's approved EIP-7702 paths.

## Experience

- `/` always opens Podcast, including after authentication.
- Guests can browse Podcast feeds, search, change language, and inspect episode details, but playback requires authentication.
- Guests can inspect the public Strategy page. Pressing **Start with Zap Strategy** requires authentication before entering the amount flow.
- A successful login resumes the exact pending action once: playback starts or the invest amount page opens.
- Guest navigation exposes Podcast and Strategy only. Home, Activity, Account, Portfolio, Send, and Invest render an authentication gate when opened directly.
- Authenticated users see the full navigation, with Podcast first.

## Authentication boundary

- Reuse `useWalletProvider().connect()` and the existing `useWalletLogin()` picker abstraction; do not introduce a second podcast-specific identity system.
- Add an app-level authenticated-action coordinator that holds one in-memory continuation, runs it once after connection, and clears it when connection fails or the web picker is dismissed.
- Gate podcast playback in `PodcastPlayerProvider` so every play entry point shares the same rule.
- Native keeps its current Privy Email flow and embedded EVM wallet. Web and desktop use the existing picker.

## Approved wallets

- The picker exposes Privy plus detected Rabby, Ambire, and OKX connectors only.
- Remove the generic WalletConnect row and all unapproved injected wallets from the visible picker. Keep the WalletConnect connector configured internally for a future curated mobile-wallet handoff.
- Treat connector branding as product filtering, not a security boundary. Existing execution-time delegation inspection and atomic submission checks remain authoritative.
- Fail closed for an already delegated account whose delegate is unknown or explicitly unsupported; only known Ambire and OKX delegates remain accepted by the current generic EIP-7702 path.

## Verification

- Unit tests cover approved-wallet filtering, unknown-delegate rejection, authenticated-action resume/cancel semantics, and podcast playback gating.
- Route and navigation tests cover Podcast as root/default and guest/full tab visibility.
- App and app-core type-check, lint, unit tests, dead-code, duplication, and builds run through Turbo/`pnpm verify changed`.
