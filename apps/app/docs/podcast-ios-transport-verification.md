# Podcast iOS 系統播放控制驗證

目前實際播放的媒體持有 Now Playing。切換至 Video 時，音訊暫停並移除自己的
鎖定畫面控制；影片啟用 Now Playing 與背景播放。影片的上一集／下一集事件呼叫
既有 podcast queue，不在原生層重複實作排序。

切回音訊時，影片先暫停、釋放控制並取消尚未完成的自動播放；音訊重新取得系統控制。
即使 Video 與 Story 都處於暫停狀態，也會明確交接控制權。

expo-video patch 支援耳機播放／暫停切換，只移除自己註冊的 command targets，
並阻止延遲的 metadata／artwork 更新覆蓋交接後的音訊資訊。原生 patch 需要重新建置
App，僅發布 OTA JavaScript 更新不足以套用。

## 自動驗證

- App 型別、lint、deadcode、duplication 與格式檢查已通過。
- 1,516 個 app 測試全部通過，包括影片控制權／metadata、共用 queue、暫停交接、
  影片錯誤 fallback、延遲自動播放取消，以及已安裝的 patch 版本／雜湊保護。
- 19 個完整瀏覽器 E2E 情境全部通過，包括影片錯誤後返回 Story。
- Android／iOS JavaScript export 與 iOS bundle boundary 檢查已通過。
- 最終整合驗證已通過：`PLAYWRIGHT_PORT=3137 pnpm verify changed`，
  97 個任務全部成功，完整 E2E 19 個情境也全部通過。
- 專用 iPhone 模擬器的 iOS Release smoke 已通過：完成原生 Release 建置、
  安裝與冷啟動，App 存活至少 15 秒，未偵測到致命啟動錯誤；
  Release executable 已確認連結 RNCAsyncStorage。
- 使用正式管理的開發環境與 Expo client boundary 重新建置後，冷啟動也通過；
  啟動截圖已確認正常顯示 Podcast 畫面與節目清單，沒有停在 Privy 設定缺失頁。

smoke 現在會建立專用模擬器，結束後只關閉並刪除該裝置。Playwright 的輸出也移至
`test-results/playwright`，避免清除同時執行中的原生 smoke 記錄。Turbo 也會傳遞既有的
`PLAYWRIGHT_PORT`／`PLAYWRIGHT_BASE_URL` 設定，讓整合驗證可以使用獨立埠。

錢包瀏覽 E2E 已依既有狀態保存契約修正：分頁切換後，Home 網址可以不含 `userId`，
但同一唯讀帳戶、禁用的擁有者操作與包含正確帳戶 ID 的分享連結都必須保留。
390px 版面檢查則等待重新渲染完成，仍嚴格要求 20px 間距。

## 實體 iPhone 驗收

狀態：**尚未在實體 iPhone 上驗證**。元件 mock 與模擬器 smoke 無法證明真實的
Control Center、Dynamic Island、鎖定畫面與耳機行為。

驗收時記錄：裝置、iOS 版本、App build、耳機型號，以及各項結果。

1. 開始播放 Story。
2. 確認 Control Center／Dynamic Island 顯示正確 metadata。
3. 確認耳機播放／暫停有效。
4. 確認耳機下一集有效，也測試上一集。
5. 播放中切換 Story → Video，確認時鐘與速度延續，音訊與影片沒有同時播放。
6. 確認 Now Playing 仍顯示影片資訊。
7. 系統／耳機暫停必須暫停影片。
8. 系統／耳機播放必須恢復影片。
9. 系統／耳機上一集與下一集必須依既有 queue 導覽；queue 邊界指令不得中斷目前播放。
10. 切換 Video → Story，以及 Video → Classroom。
11. 音訊必須一次取得系統控制；也測試暫停影片切回暫停音訊後的系統播放。
12. 鎖定畫面後重複上述測試，並確認 Classroom 各語言依序播放與獨立速度設定正常。
13. 觸發影片載入錯誤，確認音訊從影片時鐘 fallback 並重新取得 Now Playing。
14. 離開／卸載 Video，確認不會清掉音訊控制；延遲載入的 artwork 不得覆蓋音訊 metadata。

要驗證實際 App 啟動，先透過環境載入器提供 iOS Privy 設定。未載入設定的 smoke
只能驗證原生依賴與程序存活，可能停在設定缺失畫面。

```bash
node scripts/env/run.mjs --environment dev --client-target expo -- pnpm --filter @zapengine/app ios:native:sync
node scripts/env/run.mjs --environment dev --client-target expo -- pnpm turbo run test:ios:release-smoke --filter=@zapengine/app
```

實機請依支援的 iOS 流程重新建置 App，並將結果記錄於此文件或 PR。
