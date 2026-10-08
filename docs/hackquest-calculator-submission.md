# Zap Pilot — Verifiable Strategy Calculator

HackQuest project draft: https://www.hackquest.io/projects/setup/ac0eb444-63f4-48ea-a806-7f8adb760cd5
Submission: https://www.hackquest.io/hackathon/17bfad43-fdef-4432-a8d7-7595b7538c41/null/submit

## One-line intro (189/200 characters)

Reproduce a portfolio exit rule on Arbitrum Sepolia: enter market inputs, inspect Vyper contract outputs, and verify the deployed runtime codehash against recorded Python backtest examples.

## Description

Zap Pilot's Verifiable Strategy Calculator makes one portfolio decision rule independently reproducible. Users supply prices, 200-day moving averages, portfolio allocations, and prior rule state. A public Vyper contract on Arbitrum Sepolia returns the rule's allocation decision through read-only calls.

The interactive calculator includes a recorded 2025-10-18 example, editable scenarios, exact 18-decimal input encoding, and before/after allocations. The client checks the deployed runtime codehash against the pinned Vyper artifact before reading the contract. Rabby integration lets users deploy the same deterministic research contract with test ETH, without exposing private keys to the application.

The research scope is explicit: one cross-down exit rule out of six production rules. Contract execution proves what this bytecode returns for these supplied inputs. It does not authenticate market data or prior state, prove historical production execution, custody funds, or execute portfolio trades.

Technology: Arbitrum Sepolia, Vyper 0.4.3 (Shanghai EVM, gas optimization), CREATE2, Rabby/EIP-6963, viem, React, Next.js, TypeScript, Python, Vitest.

Repository: https://github.com/zapPilot/zapEngine
Sector: DeFi
Tech tags: React, Next, Web3, Python; custom Vyper, TypeScript, viem if supported.

## Submission answers

- What is your contract address?: fill ONLY after a successful deployment and runtime verification. Copy from the calculator.
- Prize tracks: Overall Prize. Promising Products Track / Grants require checking the track eligibility and your intent.
- Frontend/UI: use the publicly deployed calculator URL, not localhost. Intended existing-domain URL: https://zap-pilot.org/track-record/calculator/ — verify the new version is live before submission.
- Core protocol / smart contract addresses: DMA cross-down research calculator — Arbitrum Sepolia (421614): [verified address].
- Factory/pool contracts (under 300 chars): CREATE2 deployment factory on Arbitrum Sepolia: 0x4e59b44847b379578588920cA78FbF26c0B4956C. No pool contracts; the calculator does not hold or trade assets.
- Token contract (under 300 chars): N/A. This project does not issue a token or require ERC-20 approvals. Test ETH is used only for Arbitrum Sepolia deployment gas.
- Code produced during Buildathon (confirm event dates first, under 300 chars): Vyper DMA cross-down research slice, reproducible compiler and deployment verification, Python/EVM parity checks, recorded-input export, interactive calculator with exact decimal encoding, and Rabby/CREATE2 deployment UI. Existing Zap Pilot strategy and backtest infrastructure predate this submission.
- Sponsor technologies: none established for this calculator. Use “Have not used any” unless you confirm direct project usage. Public Arbitrum RPC, Rabby and Vyper do not imply Alchemy, GMX, or OpenZeppelin integration.

## Deploy and publish commands

Browser workflow: open http://127.0.0.1:4173/track-record/calculator/ in Brave with Rabby. Click Connect Rabby wallet, then Deploy to Arbitrum Sepolia. Review and sign in your wallet. Save the deployment transaction hash shown on the page.

```sh
cd /Users/chouyasushi/.codex/worktrees/67aa/zapEngine/apps/analytics-engine
uv run python -m scripts.pinned_strategy.compile --check
# Preview chain, CREATE2 address, salt and codehash; no broadcast:
uv run python -m scripts.pinned_strategy.deploy
# After browser deployment, replace 0xYOUR_TRANSACTION_HASH:
uv run python -m scripts.pinned_strategy.deploy --transaction 0xYOUR_TRANSACTION_HASH
uv run python -m scripts.pinned_strategy.export_landing_examples --refresh-deployment
```

The verification command checks chain, factory, transaction calldata, receipt, and runtime codehash, then verifies source with Sourcify and writes deployments.json. The export command updates deployment metadata while preserving frozen historical examples. Rebuild and publish the landing page from the same branch before submitting the public URL.

Optional terminal deployment (instead of Rabby): `uv run python -m scripts.pinned_strategy.deploy --broadcast`. This prompts privately in your own terminal; never paste a key in chat or command arguments.

## Remaining user-owned facts

Deployment signature and confirmed address; published frontend URL; demo/pitch video; team information; fundraising status; hackathon date eligibility; prize track selection. Do not invent these facts. Do not submit an undeployed address or localhost as a live demo.

## Pitch video

The <60 s pitch video is generated from code in `apps/video` (`calculator-pitch`):
narration, captions and on-screen numbers come from that workspace's storyboard
and `facts.ts`, which is tested against `packages/zap-pilot-story/src/facts/data/verifiable-strategy.json`.
Render with `pnpm --filter @zapengine/video render calculator-pitch` (output
`apps/video/out/calculator-pitch.en.mp4`). Uploading it to YouTube/HackQuest stays
user-owned.

## Demo script

1. Show the contract identity and network; explain this is a research rule, not the full production strategy.
2. Load the recorded 2025-10-18 scenario and inspect market inputs and starting allocation.
3. Call the verified contract and show the allocation output alongside the disclosed Python reference.
4. Select “BTC holds above its average” and call again to demonstrate changed rule behavior.
5. Show the runtime codehash and public Vyper source; explain the input and provenance limitations.
