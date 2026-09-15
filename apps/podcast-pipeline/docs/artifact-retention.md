# Podcast R2 保留與 GC

## 保留政策

| 物件                                                    | 保留期限                                                        |
| ------------------------------------------------------- | --------------------------------------------------------------- |
| 目前發布的 HLS、影片、縮圖、字幕、manifest、visual 原圖 | 永久                                                            |
| 已失去引用的影片／visual 版本                           | 失去引用至少 30 天，且所有物件最後修改時間均至少 30 天，才可 GC |
| `episodes/{episode}/covers/{visualHash}/{sha256}.png`   | 永久                                                            |
| `transient/visual-checkpoints/`                         | 14 天                                                           |
| `transient/social/threads/`                             | 14 天                                                           |
| rendered slides                                         | 只留本機編碼用，不再上傳                                        |

集數的建立日期不是刪除依據。不得在 `episodes/` 設 age-based lifecycle。
既有 checkpoint 可能被 `thumbnail_url` 引用，因此不遷移、不批次刪除舊路徑。
舊 Threads 副本也不在本次 GC 範圍。既有 slides 隨已退役的影片 prefix 一起 GC；目前影片的舊 slides 保留。

## HLS 替換

公開 `playlist.m3u8` URL 與 main／classroom／各目標語言的 prefix 不變。
新片段使用每次上傳獨立的 UUID 名稱，先全部上傳，再用 `If-Match`（首次發布為 `If-None-Match: *`）切換 playlist。
失敗或競態導致條件寫入被拒絕時，不刪除既有播放物件。網路中斷若發生在伺服器已接受 playlist 後，重試可能得到 412；已成功發布的 playlist 仍可播放，後續 ingest 重試會重新完成 checkpoint。

成功切換後，只清理替換前 snapshot 裡同層的舊 `.ts` 與歷史 `input.mp3`，不碰 classroom 子目錄或未知檔案。
清理失敗會記錄 `hls:cleanup-failed`；下一次成功替換會再次清理。未完成替換留下的片段亦在下次成功替換時回收。
playlist 要求重新驗證快取。已經載入舊 playlist 的播放器可能需要重新載入；首次上線前若 CDN 有舊 playlist 快取，應先清除 playlist 快取。不要快取 playlist 為 immutable。

## Checkpoint 與 Threads 重試

只有新 transient checkpoint URL 的 HTTP 404 視為過期；恢復時保留可下載的圖片，將缺少的場景交回 planner，並先清掉過期 checkpoint 的 asset ID。其他 HTTP 或網路錯誤仍失敗，避免把服務故障誤認為到期。
完成 visual 後的 payload 使用永久 visual 圖片 URL，與 transient checkpoint 無關。

Threads 每次呼叫 `prepareThreadsVideoUrl` 都重新 PUT 副本，即使本機 teaser 已快取；重新發布／重試從 canonical podcast MP4 重新準備。因此不依賴前一次超過 14 天的副本。

## Lifecycle（Cloudflare API）

確認 bucket 的 managed/custom domain 與資料庫實際 `mp4_url` host 一致後，先 GET lifecycle，合併以下兩條規則再 PUT。不要覆蓋既有 multipart abort 或其他無關規則。

```json
{
  "rules": [
    {
      "id": "podcast-visual-checkpoints-14d",
      "enabled": true,
      "conditions": { "prefix": "transient/visual-checkpoints/" },
      "deleteObjectsTransition": {
        "condition": { "type": "Age", "maxAge": 1209600 }
      }
    },
    {
      "id": "podcast-threads-transfer-14d",
      "enabled": true,
      "conditions": { "prefix": "transient/social/threads/" },
      "deleteObjectsTransition": {
        "condition": { "type": "Age", "maxAge": 1209600 }
      }
    }
  ]
}
```

API: `GET/PUT /accounts/{account_id}/r2/buckets/{bucket_name}/lifecycle`。
R2 到期刪除通常在到期後 24 小時內執行，非精確到秒的排程。[Cloudflare 文件](https://developers.cloudflare.com/r2/buckets/object-lifecycles/)

## Reference-aware GC

依 repository 的 main CI migration 部署流程套用根目錄 migration `20260915111936_podcast_artifact_retention.sql`。這是 service-role 專用操作；使用 `SUPABASE_DB_SCHEMA`（預設 `from_fed_to_chain`）與 `R2_*` 同一環境的憑證。

```sh
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/podcast-pipeline artifacts:gc --dry-run
```

預設就是 dry-run：不刪物件、不寫觀察記錄、不取得 DB fence。
讀取所有影片／visual row 的非空 prefix（即使 row 暫時 queued/failed 仍保留），並保護 manifest、visual payload、checkpoint 中引用的其他版本。R2 與 DB 都完整分頁；讀取失敗不得當成空集合。

影片／visual row 更換 prefix 或被刪除時，trigger 記錄 `unreferenced_at`；重新引用會清除時間。初次掃描遇到沒有歷史記錄的舊版本，先從觀察當天計算完整 30 天，不會因檔案很老而立即刪除。
未知或不完整物件 metadata 阻止整個 prefix 的刪除。GC 不遍歷 HLS 作為候選、不處理 covers／舊 checkpoint／舊 Threads。

確認 dry-run 後，在 render worker 已排空、暫停新渲染工作的維護窗口執行：

```sh
node scripts/env/run.mjs --environment prod -- pnpm --filter @zapengine/podcast-pipeline artifacts:gc --apply
```

`--apply` 使用 DB fence；任何 `processing` row（包含過期 lease）都使取得失敗。fence 存續時影片與 visual 表的 INSERT/UPDATE/DELETE/TRUNCATE 均被拒絕，阻止檢查引用與 R2 刪除間的新發布競態。API 讀取、已發布媒體播放繼續正常。不要在繁忙的 render 階段排程。

JSON 日誌：`gc:candidate`（prefix、decision、物件數、bytes）、`gc:deleted`、`gc:failure`、`gc:summary`。退出碼 1 表示失敗；已刪除 prefix 可安全重跑，R2 批次錯誤仍保留退役記錄供重試。可把同一命令接到未來的排程；本次不新增常駐程序。

### 程序中斷後恢復

fence 沒有自動過期，避免舊 GC 還在刪除時新 worker 開始發布。正常完成（包含捕捉到的失敗）會釋放。
若程序被強制終止，從 `artifact_gc_control` 或 `gc:acquire` 日誌找 owner，**先確認原 GC 程序已停止**，再以 service role 呼叫 `release_artifact_gc(p_owner)`。不可直接 UPDATE control 表，亦不可在原程序仍運作時解除。

## SQL 本機驗證

在獨立的空 PostgreSQL 測試資料庫建立 `from_fed_to_chain` schema，以及兩個測試表 `episode_videos` / `episode_video_visuals`，各含 `id int primary key, status text, r2_prefix text`；需已有 `anon`、`authenticated`、`service_role` 角色。
套用上述 migration，再以 `psql -v ON_ERROR_STOP=1` 執行 `apps/podcast-pipeline/scripts/test-artifact-retention.sql`。測試使用 transaction 並 rollback，驗證退役時間、重新引用、工作中的拒絕、fence 所有權及禁止引用變更。

## 2026-09-15 設定紀錄

已透過 Cloudflare 插件核對 production bucket `from-fed-to-chain-mono` 的公開網域，並加入上述兩條 14 天規則，GET 回讀確認啟用，保留預設 7 天 multipart abort。加入時 `transient/` 為空，沒有手動刪除 production 物件。
DB migration 依 [CONTRIBUTING](../../../CONTRIBUTING.md#adding-a-database-migration) 交由 main CI 部署；本機不直接改 production schema。程式碼仍需走既有部署流程，新的 transient 上傳路徑才會生效。
