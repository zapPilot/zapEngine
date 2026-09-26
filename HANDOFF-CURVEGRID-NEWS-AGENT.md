# HANDOFF — Curvegrid news-triggered autonomous transaction demo

Type: B — spec, base `66b05751072dc31d5f98b50c658139b19c5133e5` (`main`)

## §0 Vantage

Can read: `zapPilot/zapEngine` main through the GitHub connector at `66b05751072dc31d5f98b50c658139b19c5133e5`; root/scoped AGENTS, podcast ingest/Telegram, mobile Expo config, plan-orchestration, and wallet execution sites were opened.
Can run: nothing; this is a pre-implementation handoff only.
Cannot see: the owner's local working tree, any unpushed branch/WIP, runtime secrets, Curvegrid credentials, or the actual hackathon wallet balances.

## Verified facts

- The podcast ingest already obtains article text before script generation; `ensureEpisodeLocalizationScript` calls `scrapeAndNormalize`, which calls `scrapeArticle(url)`, and resumes from persisted localization state when scraping has already completed. [verified: apps/podcast-pipeline/src/services/ingest/script-stage.ts — `const scraped = await scrapeAndNormalize(...)` / `scrapeArticle(url)` (around lines 112–174)]
- Podcast ingest is intentionally resumable and durable; adding a side effect that can execute twice on ingest retry would violate that operating model. [verified: apps/podcast-pipeline/AGENTS.md — `Resumability is load-bearing` (Gotchas section)]
- The existing intent/orchestration layer already exposes GMX v2 and Morpho building blocks and returns prepared plans/transactions; this hackathon should reuse that execution surface rather than create a second protocol integration stack. [verified: apps/account-engine/src/modules/plan-orchestration/service.ts — `PlanOrchestrationService` and `IntentEngine` deps including `buildGmxV2Supply`, `buildGmxV2Withdraw`, `buildSupply`, `buildSwap` (around lines 55–104)]
- The intent engine is explicitly a pure `intent → PreparedTransaction[]` layer and must not absorb AI strategy, persistence, or identity. [verified: packages/intent-engine/AGENTS.md — `This is the intent / routing core: intent → PreparedTransaction[], pure.`]
- Current client execution is wallet-oriented: `executeDepositPlanWithWallet` resolves a wallet client / atomic batch executor and `executeDepositPlan` submits the prepared transactions through EIP-7702. A server-side autonomous signer is therefore a new execution transport, not a reason to rewrite the builders. [verified: packages/app-core/src/lib/wallet/executeDepositPlan.ts — `executeDepositPlanWithWallet` / `executeDepositPlan` (around lines 211–300)]
- Telegram already has an episode share URL builder and includes that URL in podcast-ready / video-completed messages. [verified: apps/podcast-pipeline/src/services/telegram.ts — `buildEpisodeShareUrl`, `buildTelegramAudioReadyMessage`, `buildTelegramVideoCompletedMessage` (around lines 111–151)]
- The Expo app already declares scheme `zappilotv2` and iOS associated domain `applinks:from-fed-to-chain-api.fly.dev`; however repository search found no checked-in `apple-app-site-association` / Android `assetlinks.json` implementation, so the current web share URL must not be assumed to open the installed app yet. [verified: apps/app/app.config.ts — `const appScheme = 'zappilotv2'` and `associatedDomains: ['applinks:from-fed-to-chain-api.fly.dev']` (around lines 48–73)]
- The authenticated GitHub connection for this spec is `i-xtsu-sixyou-ken-mei`, matching the repository write guardrail. [verified: GitHub authenticated user → `i-xtsu-sixyou-ken-mei`]

## Product requirements from owner

- The hackathon goal is **not** to design a reusable AI trading policy system. Do not spend time on policy DSLs, general strategy engines, portfolio optimization, confidence frameworks, agent loops, or alpha research. [out-of-band: owner conversation, 2026-09-26]
- The feature to prove is: a manually supplied news article enters the existing podcast pipeline, article text becomes available, an AI-triggered path causes a small autonomous on-chain transaction to be signed/submitted, and the result is recorded for later explanation. [out-of-band: owner conversation, 2026-09-26]
- The transaction strategy may be hard-coded for the demo. It only needs to demonstrate that the agent can autonomously cause a real signed transaction through the Curvegrid/MultiBaas integration and existing Zap Pilot protocol execution infrastructure. [out-of-band: owner conversation, 2026-09-26]
- Keep real money exposure tiny: prefer about **$1** and keep it **below $5** when the existing protocol/builder/minimum/gas constraints allow it. Never bypass existing safety/minimum/simulation checks merely to hit the exact demo amount. [out-of-band: owner conversation, 2026-09-26]
- The preferred demo fixture is the recent Bitget hack article. For the demo only, it is acceptable to hard-code the narrative: the attacker buys ETH aggressively, the agent treats that as short-term upward ETH pressure, and the action is to sell/withdraw a tiny ETH-related position. This is a demo rule, not a production trading claim or reusable policy. [out-of-band: owner conversation, 2026-09-26]
- The exact executable action is flexible. A tiny existing GMX ETH-related withdrawal/sell is preferred if it already fits the supported plan surface; depositing USDC into Morpho or Hyperliquid, or another already-supported tiny real transaction, is acceptable if it produces a cleaner reliable demo. Do **not** add a new protocol/market solely to match the story. [out-of-band: owner conversation, 2026-09-26]
- By the next day, the user should be able to see what the AI did either in the system and/or via Telegram. The summary must identify the autonomous action and link to the related podcast episode. [out-of-band: owner conversation, 2026-09-26]
- The podcast link in the final notification should be an **app smart link**: tapping it should take an installed Zap Pilot app directly to that episode/video rather than merely opening a generic browser page. [out-of-band: owner conversation, 2026-09-26]
- UI/page placement is intentionally **not decided here**. Inspect the existing product and choose the smallest coherent presentation; do not treat “reuse current podcast page” or “build a separate demo page” as a requirement. [out-of-band: owner conversation, 2026-09-26]

## Inventory

`apps/podcast-pipeline/src/services/ingest/script-stage.ts` — `ensureEpisodeLocalizationScript` / `scrapeAndNormalize` — article body becomes available here and ingest can resume from persisted text → implement: identify the narrow durable handoff point after source text/episode identity is persisted; do not couple transaction submission to a retryable scrape call.

`apps/podcast-pipeline/AGENTS.md` — `Resumability is load-bearing` / durable bounded queue rules → implement: preserve fire-and-forget + resumability semantics; autonomous execution must not make podcast retry capable of double-spending.

`apps/podcast-pipeline/src/services/telegram.ts` — `buildEpisodeShareUrl` and completion messages → implement: extend or add an agent-action notification path that can carry the action summary plus the smart episode link; do not break existing podcast completion notifications.

`apps/app/app.config.ts` — `scheme: appScheme` / `associatedDomains` → implement: inspect the app/router and server before choosing custom scheme vs universal/app links; make the final notification link resolve to the exact episode/video.

`apps/account-engine/src/modules/plan-orchestration/service.ts` — `PlanOrchestrationService` → reuse: existing plan composition/safety path where it already supports the chosen demo action; do not widen account-engine beyond its bounded orchestration module.

`packages/intent-engine/AGENTS.md` — pure intent boundary → left alone conceptually: AI/news logic must live above this package.

`packages/app-core/src/lib/wallet/executeDepositPlan.ts` — `executeDepositPlanWithWallet` / EIP-7702 client transport → inspect for reusable transaction/result types, but do not force autonomous execution through a UI-connected wallet abstraction.

Curvegrid/MultiBaas integration site — not examined because no integration exists in the inspected main tree → implement after reading sponsor requirements/docs and decide the narrow adapter boundary.

Agent action persistence/history site — not examined / not present in surveyed files → implement the minimum durable record needed for idempotency, next-day summary, transaction hash/status, related episode, and explanation.

## Intended end-to-end invariant

- [requirement] One manual article submission can produce both the normal podcast/video and at most one matching autonomous demo action.
- [requirement] Podcast ingest failure/retry/resume must never create a second on-chain action for the same article/demo rule.
- [requirement] The action must be a **real signed/submitted transaction** from a dedicated low-value hackathon/test hot wallet; a mocked transaction is insufficient for the core demo.
- [requirement] Persist enough evidence to show: triggering article/episode, hard-coded decision, intended amount/action, submission status, transaction hash (when available), and timestamps.
- [requirement] The later notification/history reads persisted execution truth; do not fabricate “AI did X” from the intended plan if the transaction failed.
- [requirement] The podcast generation path remains useful even if the autonomous action fails; transaction failure must not destroy/retry an otherwise healthy podcast ingest.
- [suggestion] Treat the news-to-agent handoff as a durable idempotent job/event keyed by stable episode/article identity plus demo rule/version rather than awaiting transaction execution inline inside `scrapeAndNormalize`.
- [suggestion] Keep the LLM role deliberately tiny: the Bitget demo may simply recognize/confirm the fixture and emit a fixed action token/schema; the deterministic demo executor owns the actual transaction choice.
- [suggestion] Prefer one supported protocol action with the fewest cross-chain/keeper/settlement dependencies. The hackathon story benefits more from a reliable signed tx than from a sophisticated route.

## Decisions

- Do **not** build a general AI policy engine. Hard-code the Bitget demo rule and transaction choice. [requirement]
- Do **not** build an autonomous multi-step agent loop. One news trigger → one bounded decision → one bounded transaction is enough. [requirement]
- Reuse existing GMX/Morpho/Hyperliquid/plan infrastructure wherever possible rather than implementing protocol calls directly inside the podcast service. [requirement]
- Keep the signer/executor boundary replaceable so this can remain an experimental Zap Pilot subsystem after the hackathon, but do not generalize beyond what the demo needs. [suggestion]
- Keep transaction value tiny and isolated in a dedicated wallet. Exact `$1` is preferred, not worth weakening safety or adding protocol work; any successfully executable sub-`$5` amount satisfies the intent. [requirement]
- Do not choose the final UI architecture in advance. Claude should inspect the current podcast/app surfaces and pick the least invasive coherent presentation. [requirement]
- The final user-facing story is a closed loop: news arrived → autonomous action happened → execution was recorded → next-day summary says what happened → smart link opens the explanatory podcast video. [requirement]

## Scope

Deliberately out:
- General-purpose strategy/policy design, portfolio optimization, risk scoring, confidence tuning, backtesting, or proving trading alpha — not needed for this hackathon.
- Multiple sponsor integrations beyond what is needed for the two Curvegrid bounty stories.
- Multiple autonomous strategies or protocol routing options exposed to the user.
- Production custody/key-management architecture beyond a deliberately low-value hackathon wallet.
- New GMX markets / new protocols solely to make the Bitget narrative exact.
- UI redesign beyond the minimum surface selected after inspection.

Not reached:
- Exact Curvegrid/MultiBaas adapter/API shape and sponsor-specific evidence to surface in the demo/submission.
- Exact persistence schema/job ownership.
- Exact mobile smart-link implementation and fallback behavior.
- Exact chosen protocol transaction after checking live minimums, wallet inventory, gas, and simulation.
- Exact “next day” scheduling mechanism vs a digest generated on the next relevant app/TG interaction.

## Traps

- Podcast ingest can replay/resume. If autonomous submission is placed directly after `scrapeArticle()` without durable idempotency, a retry can submit twice. [verified: apps/podcast-pipeline/src/services/ingest/script-stage.ts — `needsScrape` resume path and `scrapeArticle(url)` (around lines 151–174)]
- Do not put strategy/persistence into `packages/intent-engine`; its scoped AGENTS explicitly forbids both. [verified: packages/intent-engine/AGENTS.md — `zero analytics/strategy and zero identity/persistence knowledge`]
- Do not casually extend account-engine outside `plan-orchestration`; its scoped AGENTS says account-engine is identity/persistence and the bounded orchestration module is the only intent exception. [verified: apps/account-engine/AGENTS.md — `Architecture boundary`]
- Existing app execution assumes an interactive wallet/EIP-7702 transport. A hackathon hot-wallet signer should be treated as a separate server-side transport/adapter, not faked through UI wallet state. [verified: packages/app-core/src/lib/wallet/executeDepositPlan.ts — `Wallet client is required for generic EIP-7702 execution` (around line 277)]
- iOS associated domains are configured, but the repository survey did not find the server association files needed to prove universal links are actually complete. Verify end-to-end on device before calling the smart link done. [verified: apps/app/app.config.ts — `associatedDomains` (around line 68); repository search for `apple-app-site-association` / `assetlinks.json` returned no match]
- A GMX action may involve keeper settlement/execution fees and may not be the cleanest way to demonstrate a `$1` action. Check the actual existing plan constraints before locking the demo protocol. [assumed — live quote/minimum/fee behavior was not run in this GitHub-only handoff]

## Open questions

- What is the smallest already-supported transaction that can execute reliably for the demo wallet under current protocol minimums and gas: GMX ETH-related withdrawal/sell, Morpho USDC deposit, Hyperliquid deposit, or another existing path? [assumed — no live wallet/quote/simulation available here]
  Stakes: GMX works cleanly under $5 → strongest match to the Bitget story; otherwise choose the simplest existing signed transaction and keep the Bitget rule intentionally demonstrative rather than economically exact.

- Where should the autonomous signer adapter live after inspecting current app/service boundaries? [assumed — no existing Curvegrid integration exists in surveyed main]
  Stakes: a clean service boundary lets the experiment survive after the hackathon; putting keys/signing into podcast or intent-engine would violate current architecture and make later extraction expensive.

- What exact Curvegrid/MultiBaas calls are necessary for bounty qualification: composition, submission, event indexing, or a combination? [assumed — sponsor docs/requirements were not re-read during this repo-only handoff]
  Stakes: determines the narrowest integration and what must be visible in the demo/readme; do not overbuild before confirming.

- Does the current Fly domain already serve valid iOS/Android association metadata outside this repository, and does the Expo router already resolve `/e/:episodeId` on cold start? [assumed — repo search found associated-domain config but no association files or verified route handling]
  Stakes: yes → reuse the current HTTPS episode URL as the smart link; no → add the minimum link association/router work before Telegram can satisfy the “open the app directly” requirement.

- Should “next day” be an actual scheduled digest or simply the next morning/next user touchpoint reading all actions since the previous digest? [assumed — owner requires next-day visibility, not a specific scheduler]
  Stakes: a real schedule adds job/scheduling state; on-demand/digest-on-open is smaller if the demo narrative does not require clock-accurate delivery.
