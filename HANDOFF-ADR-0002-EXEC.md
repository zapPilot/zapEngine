# Handoff: 執行 docs/adr(ADR 0002 action items)— 交接文件

> 交接時間:2026-07-07。分支 `feat/adr-0002-action-items`(base = main `546c5013`)。
> 任務:執行 ADR 0001/0002 中「非人工、未被閘住」的 action items。收尾後可刪除本檔。

## 一、已完成並 commit(勿重做)

| Commit | 內容 | 狀態 |
| --- | --- | --- |
| `4c2306a2` | **A1** challenge 簽章錢包綁定:`POST /users/:userId/wallets/challenge`(單次、5 分 TTL、in-memory,同 Privy preview 模式)+ `addWallet` 可選 `signature`(驗簽失敗一律拒;成功戳 `ownership_verified_at`;不帶 = observe-only 綁定)。Migration `20260707000000`。ADR A1 已勾 | account-engine 全關卡綠(type-check/lint/test/deadcode,749 tests) |
| `ae3a5f33` | ⚠️ **不是本任務的工作** — 另一個並行 session 的 landing 重定位 commit(見「三、事故記錄」) | 保留原訊息;merge 前由使用者決定去留 |
| `08834787` | **A3** ledger 模組:`ledger_{signal,decision,plan,execution}_events` 4 表(migration `20260707000001`,REVOKE UPDATE/DELETE/TRUNCATE + guard trigger 雙層 append-only)、`src/modules/ledger/`(zod 綱要 + `LedgerService`,decision 事件強制 `strategyVersion`+`configIdentity`)、`BaseService.insertOne` 加 `useServiceRole`。ADR A3 已勾。事件生產者接線屬 0001-M3,本 phase 不接 | 全關卡綠 |
| (本 commit) | **A2** spike 結果落檔 `docs/spikes/2026-07-07-eip7702-session-scoping.md` + ADR A2 已勾(結論:Ambire/OKX 皆不足;Stage B 改 scope 至 MetaMask Delegation Framework;Stage C 未觸發)+ **A5 的 intent-engine 半成品**(見下) | ⚠️ intent-engine 測試**尚未跑過** |

## 二、進行中:A5 模擬平面強化(做到一半)

ADR 0002 A5 = ① plan-orchestration 路徑 fail-closed 模擬;② 伺服器端 min-received 驗證;③ approve 額度上限驗證。

### 已寫(intent-engine 端,未驗證)

- `packages/intent-engine/src/validators/plan-safety.validator.ts`(新):`assertApprovalCaps`(拒 maxUint256;fromToken 的 approve ≤ fromAmount)、`assertMinReceived`(讀 `calls[].meta.route.estimate.{toAmount,toAmountMin}` — LiFi quote 原樣掛在 meta.route,見 `lifi.adapter.ts:256-291`;檢查 min>0 且滑點 ≤ maxSlippageBps)、`PlanSafetyViolationError`
- `test/unit/plan-safety.validator.test.ts`(新)
- `src/adapters/simulation.adapter.ts`(重寫):刪掉 stub `TenderlySimulationAdapter`/`TenderlyConfig`(repo 內零使用者,已確認);保留 `SimulationAdapter`/`NoopSimulationAdapter`(`createIntentEngine` 依賴);新增 `createTenderlyBundleSimulationAdapter`(真 simulate-bundle API,fetch 可注入,回 `passed|failed|unavailable`,逾時/HTTP 錯/格式錯 → unavailable)
- `test/unit/simulation.adapter.test.ts`(重寫,舊檔在測已刪除的 stub)
- `src/approvals/erc20Approval.ts`:`buildApproveTx` 拒 unlimited(maxUint256 在 intent-engine 零使用,安全)
- barrels 已同步:`adapters/index.ts`、`validators/index.ts`、`src/index.ts`
- `test/unit/api-documentation.test.ts`:export 斷言已改(Tenderly stub → 新工廠 + validators)

### 下一步(依序)

1. **跑 intent-engine 關卡**:`pnpm turbo run type-check lint test deadcode dup:check --filter=@zapengine/intent-engine`,修到綠。順手在 `test/unit/erc20Approval.test.ts` 補 buildApproveTx 拒 unlimited 的案例。
2. **plan-orchestration 接線**(`apps/account-engine/src/modules/plan-orchestration/`,模組規則見其 CLAUDE.md:service 錯誤 framework-free、route 映射 4xx/5xx、模組不得 import account-engine 其他部分):
   - `service.ts`:deps 加 `simulation?: { adapter: BundleSimulationAdapter; mode: 'enforce' | 'off' }`。`buildDeposit`/`buildWithdraw` 回傳前:永遠跑 `assertApprovalCaps`(invest 分支帶 `{fromToken: request.fromToken, fromAmount: request.fromAmount}`,其他分支帶 `{}`)+ `assertMinReceived`(maxSlippageBps 先給 100);mode=enforce 再 `simulateBundle({chainId: sourceChainId, from: userAddress, calls: [...approvals, ...calls]})`(followUps 是 HyperCore 非 EVM,不模擬),`failed`/`unavailable` → 丟模組自訂錯誤(新 `errors.ts`)
   - `route.ts`:catch 映射 — `PlanSafetyViolationError` → 400、模擬 failed → 422、unavailable → 503
   - `module.ts`:config 加 `simulation?: { tenderly?: {accountSlug, projectSlug, accessToken}; required?: boolean }`;creds 齊 → enforce;缺而 required → **啟動即 throw**(仿 `parseDepositDefaultSplit` fail-at-boot 哲學);缺而非 required → off
   - `container.ts`:傳 `env.TENDERLY_*`(env.ts:36-38 已有)+ 新 `PLAN_SIMULATION_REQUIRED`
   - `env.ts` 加 `PLAN_SIMULATION_REQUIRED: z.string().optional()`;`.env.example` 補文件(注意:改 `.env*` 會廣泛失效 turbo 快取,正常現象)
   - 測試:`test/unit/routes/planOrchestration.spec.ts` 補 gate 案例(mock adapter 回 failed/unavailable → 422/503;off mode 不呼叫)
3. **勾 ADR A5**(`docs/adr/0002-…md` action items,勾法仿 A1/A3:`[x]` + 一兩行實作註記)。
4. **Commit A5**(訊息風格見 `git log`;結尾 `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`)。
5. **收尾**:`pnpm verify branch`(慢、20-30 分無輸出是正常,失敗看 `.ai-verify/result.json`;若 app e2e 因 packages 變更被觸發而 ENOENT,先 `pnpm --filter @zapengine/app build:web`,並刪掉 build:web 掉在 app 根的 stray `bundle.js`/`assets-out`)。**不要 push、不要開 PR**(使用者未授權)。

## 三、事故記錄與環境警告(重要)

- **共享 checkout 有並行 session**:16:45 曾發生另一個 session 在本分支 commit,把本任務 staged 的檔案捲進它的 commit(git index 是進程共享的)。已拆開重建為 `4c2306a2` + `ae3a5f33`。**每次 commit 前必查** `git branch --show-current` 與 `git diff --cached --name-only`;commit 若報 `cannot lock ref 'HEAD'` 即是又發生競態,先 `git log` 看清楚再處理,不要盲目重試。
- `ae3a5f33`(landing 重定位 + `CLAUDE_DESIGN_HANDOFF.md`)是使用者另一條工作線的產物,坐在本分支上;PR/merge 時要提醒使用者決定(cherry-pick 到 main 或隨分支合入)。
- 單 workspace 跑關卡用 **turbo**(`pnpm turbo run … --filter=…`),不要 `pnpm --filter` 直跑(TS2307)。
- turbo 的 `lint` 只掃 `src/`;`test/` 的 eslint+prettier 由 commit 時的 lint-staged 抓 — test 檔的格式錯誤會在 commit 才爆,先手動 `pnpm --filter <pkg> exec prettier --write <測試檔>` 可避免。
- macOS 無 `timeout` 命令;內圈驗證用單 spec vitest,別用 `verify ci`。

## 四、明確跳過的項目(勿撿起)

- 0001-D1 Vercel Root Directory flip(**Human-only**,dashboard 操作)與其後的 `apps/frontend` 刪除 PR(被 flip+24-48h soak 閘住;提前刪會弄壞所有部署,ADR 明寫)。
- 0001 M1–M3、plan-composer 抽取(大型里程碑,依序閘住)。
- 0002 A4(依賴 A3 落地 + 錨定排第二)、A6(依賴 D5 事件接線)。
