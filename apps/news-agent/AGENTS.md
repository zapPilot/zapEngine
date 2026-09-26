# News agent demo

Read ../AGENTS.md. Plain functions, local tsx only; no watch runner, HTTP server,
control-center integration, or pnpm ops entry.

Only the operator-owned demo wallet is supported. Never use user wallets,
delegations, or session keys. Expansion requires the shared Unattended wallet
policy. Keep wallet funding below $5 and refill manually: wallet balance is the
actual spending boundary; the guard is defense in depth.

Revoke without the daemon by revoking the MultiBaas API key, disabling the Azure
key, or moving the wallet balance. Never store private keys here.

Only import shared contracts from @zapengine/types. Plan exclusively through
plan-orchestration and sign only reviewed batches. Podcast tables are read-only.
Each arm permits at most one on-chain attempt. Ambiguous evidence requires
manual attention, never a fresh nonce or automatic second attempt.
