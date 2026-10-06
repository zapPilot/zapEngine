# KOKODE 網站部署與搬遷

更新日期：2026-10-06（Asia/Tokyo）。本文件記錄網站託管；不代表院內 AI 產品已實作。

## 正式託管

選用 `zapPilot/zapEngine` 的 GitHub Pages，部署來源是 GitHub Actions，網站產物是
`apps/kokode-ai/dist`。Kokode 是靜態 Vite 網站，現有 Pages workflow 已涵蓋 build、
媒體驗證、後端部署與 E2E，這次不另建 Vercel 專案。Zap Pilot 的 Vercel 託管維持原設定。

正式網址為 `https://www.kokode.xyz/`；apex `kokode.xyz` 應轉址到 www，HTTP 應轉到 HTTPS。
Cloudflare 的 apex／www DNS 皆指向 `zappilot.github.io`，保留 DNS-only 模式。
GitHub Pages custom domain 僅由 monorepo 綁定，舊 repo 不再綁定該網域。

## 部署與憑證邊界

`.github/workflows/kokode-pages.yml` 只在 main 的成功 push CI 後執行正式部署。
不得略過 CI、媒體指紋、schema/migration 檢查或後端 E2E。

- `kokode-production` 限制 main，保存 `VITE_SUPABASE_URL` 公開變數和
  `KOKODE_SUPABASE_ACCESS_TOKEN` secret；secret 來源是 Kokode 自己的 Infisical project。
- `kokode-preview` 供 PR build 使用，只保存公開變數，沒有 production secret。
- `VITE_SUPABASE_URL` 從共享 Supabase project 的公開座標讀取；不寫入 Zap Pilot 的 Infisical。
- 任何正式或 preview build 都必須先驗證公開 URL。沒有 URL 的 bundle 只會在瀏覽器排隊，
  測試通過也不能視為可上線。
- 表單直接呼叫既有 `genba-lead`，網站 bundle 不包含 Supabase key。
- Function allowed origins 保留正式 HTTPS www 與支援的 localhost 開發來源；舊個人 Pages
  origin 在搬遷後移除。不要為了 HTTP 表單而放寬 CORS。

## 切換與驗收

先完成新的 Pages build、媒體驗證、後端 schema 檢查與自清理 E2E，再切換 custom domain
與 DNS。確認 bundle 內有正式 lead endpoint，不能只看 HTTP 200。

切換後檢查三語 landing、醫師與 partner deck、privacy、favicon、OG 和所有引用的 assets，
並檢查 www HTTPS、HTTP redirect 與 apex redirect。表單以唯一的 `e2e+…@example.com`
fixture 驗證，再只清理該 fixture。

舊 repo `i-xtsu-sixyou-ken-mei/kokode-ai` 保留原始作者與歷史；確認新站可用後停用
`Build and deploy KOKODE` workflow，避免它再部署共享 `genba-lead` 或覆寫 origin secret。

## 2026-10-06 執行紀錄

搬遷與驗收已完成。正式網域由 monorepo GitHub Pages 提供；HTTP／apex 皆轉址到 HTTPS www。

- 原站：個人 repo Pages、`www.kokode.xyz`，未啟用 Enforce HTTPS。
- 目標 repo：原先以 legacy 模式發布 main 根目錄，已改為 Actions workflow 模式。
- `kokode-production` 原先無 variables／secrets；已配置公開 URL、Kokode 部署憑證及 main policy。
- 首次重試發現舊產物缺少 Supabase URL，已停止重試並重新 build。
- 搬遷使用 `fc0aad9f58197f3fcfea0156b973c1ffaa4f1322` 的成功 CI 與重新執行的
  [Kokode Pages run 37429890892](https://github.com/zapPilot/zapEngine/actions/runs/37429890892)。
  此 revision 與檢查時 main `7e15415a6d0e12dc7d4dac768ec35b8870cd111e` 的 Kokode、story、
  media-release、genba-lead 和 Pages workflow 無差異。
- 新的 ownership／updates 文案在既有 PR 分支，尚待旁白與媒體重產；不混同本次正式站內容。

- 重跑 build 造成兩份同名 `github-pages` artifact，deploy-pages 拒絕部署。下載檢查並備份後，
  只移除無 endpoint 的舊產物 `11397050217`；部署使用新產物 `11413498769`。
  再次重跑 build 時，先辨識各產物的實際內容，不可任意刪除全部產物。
- 最終 Pages run 成功；build、media:verify、backend schema、function deployment 與 E2E 均通過。
- custom domain 已轉到 monorepo；certificate approved，Enforce HTTPS 開啟；Cloudflare apex/www
  CNAME 皆為 `zappilot.github.io`。
- 正式三語九頁 HTML 與下載的核准 artifact 逐 byte 相同；8 個引用 assets 的 SHA-256 相同。
  privacy、favicon 和三語 OG 也都回傳成功。
- 切換後 production lead E2E 10 項通過，測試 lead 只儲存一次並已自清理。
- 舊 workflow `361758783` 已停用，舊 custom domain 已移除；舊個人 Pages origin 已從
  function allowed origins 移除。

- 21:48（Asia/Tokyo）再次驗收：HTTP www、HTTP apex、HTTPS apex 皆轉址到 HTTPS www；
  公開 DNS 回傳 `zappilot.github.io`，證書 approved，Enforce HTTPS 為 true。
- 本分支新增的 build endpoint preflight 與 PR preview environment 選擇尚未 push／合併。
  正式 main workflow 目前仍使用原有 build 步驟；production environment 已限制 main，
  因此 PR 的環境隔離修改需要隨既有 PR 一起發布。新故事 PR 的媒體指紋仍待重產，不能略過閘門合併。
- verification：workflow 成功；正式 HTML／asset 比對與 lead E2E 通過；本機 workflow
  的 missing/invalid URL deterministic check、shell syntax、Prettier 與 `pnpm lint repo` 通過。
