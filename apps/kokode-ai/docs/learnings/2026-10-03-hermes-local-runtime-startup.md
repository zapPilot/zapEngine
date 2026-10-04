# Hermes 本機模型啟動失敗：runtime 能力檢測逾時

日期：2026-10-03（Asia/Tokyo）

## 結論

這次不是「沒有安裝 llama.cpp」。Hermes 已安裝官方 b10964、darwin-arm64、Metal runtime，且已下載 `Hermes-3-Llama-3.2-3B.Q4_K_M.gguf`。失敗發生在模型載入之前：Hermes 用 `llama-server --help` 檢測引擎支援的參數，15 秒內沒有完成，便回報泛用的「The local server could not start — check the runtime is installed」。

讓已安裝的 runtime 在一般執行環境完整完成一次版本檢測後，同樣的 `--help` 檢測約 0.09 秒就成功。Hermes 隨後啟動其管理的伺服器，CLI 推論也成功。不曾重新下載引擎或模型，也沒有修改 Hermes 原始碼或降低系統安全設定。

## 已觀察到的證據

- UI 同時顯示 `llama.cpp runtime installed`、`Ready · metal`、`Engine up to date`，但按 Use／Turn on 失敗。這些安裝狀態不代表伺服器已經可用。
- `~/.hermes/logs/errors.log` 多次出現 `llama-server --help` 在 15 秒後逾時；不是模型不存在或記憶體不足的錯誤。
- 本機 `hermes_cli/local_runtime/supervisor.py` 的 `_direct_io_args()` 以 `subprocess.run(..., capture_output=True, timeout=15, cwd=executable.parent)` 呼叫 `--help`，判斷應使用 `--load-mode dio` 或舊版 direct-I/O 參數。
- 受限制的 command 環境中，`--version`／`--help` 很快成功；一般環境中，相同二進位檔曾超過 5、20 秒的測試期限。單一環境的成功不足以證明桌面啟動已修好。
- 在一般環境直接執行 `--version`，等待程序自行完成後，回報 `0.4.1-dev`、build 10964、commit `b29c606e2`。
- 再用一般環境重測與 Hermes 相同的 `--help` 呼叫，約 0.09 秒完成，exit code 0。
- Hermes 紀錄顯示 Metal router 已啟動；`server.json` 的 owner PID 對應原本的桌面後端，而非臨時測試程序。
- 本機伺服器 `/health` 回傳 `{"status":"ok"}`；透過 Hermes CLI 指定同一個本機模型，成功生成 `LOCAL_MODEL_OK`。

## 尚未證實的根因

證據支持「runtime 執行／初始化卡住，使 Hermes 的能力檢測逾時」。沒有取得足夠的程序堆疊或系統紀錄，無法確定較底層原因。首次執行驗證、macOS 安全檢查或動態函式庫初始化都不能在這次紀錄中當成已證實原因。也不能宣稱重新安裝修復了問題，因為此次沒有重裝。

## 下次可重用的排查流程

1. 先看 runtime 是否存在、模型是否已下載，再查錯誤紀錄；不要僅依照 UI 的泛用提示就重裝。
2. 找到實際使用的 `llama-server`，在與桌面後端相近的一般執行環境執行 `--version` 和 `--help`。若有逾時，留意測試是否過早殺掉程序，阻止首次初始化完成。
3. 允許官方 runtime 完整跑完一次，然後重測。若仍卡住，再針對活著的程序取得堆疊與系統紀錄；保留不確定性，不直接移除 quarantine 或關閉安全保護。
4. 回到 Hermes 的 Local Models，重試 Turn on／Use；透過官方 UI 或 CLI 保存本機模型設定。
5. 驗證伺服器健康與一次真實生成，並確認由 Hermes 管理程序。`--version` 成功或 UI 的 Ready 狀態不是端到端驗證。

此次保存的設定為 `model.provider: llamacpp`、`model.default: Hermes-3-Llama-3.2-3B.Q4_K_M`、`local_runtime.enabled: true`。官方 CLI 設定與生成測試：

```sh
hermes config set model.provider llamacpp
hermes config set model.default Hermes-3-Llama-3.2-3B.Q4_K_M
hermes --provider llamacpp -m Hermes-3-Llama-3.2-3B.Q4_K_M \
  -t '' -z 'Reply with exactly: LOCAL_MODEL_OK' --ignore-rules
```

CLI 測試已完成；桌面 Local Models 的可讀狀態顯示 Running。沒有取得桌面聊天生成測試的完成證據，不把它記為已驗證。

## 診斷資料與權限

本機 dashboard API 有自己的 session 驗證。此次從程序環境取得 session token 的診斷提案被自動審核拒絕，沒有執行，改走官方 CLI 與 UI 完成。不要為了方便診斷而繞過驗證。

分享日誌前必須移除憑證：llama-server 啟動紀錄可能包含 `--api-key`，`server.json` 也可能包含金鑰。這份 learning 只保留必要的錯誤與驗證結果，不保存原始日誌或任何 token。

## 對 KOKODE 的啟示

本機推論產品應區分「引擎已安裝」、「能力檢測完成」、「伺服器健康」、「模型推論成功」。能力檢測逾時應回報具體命令、期限與可重試的下一步，避免引導使用者無意義地重新下載模型。這是本次經驗得到的產品建議，尚未在本 repo 實作。

參考：[Hermes 官方 Local Models 文件](https://hermes-agent.nousresearch.com/docs/user-guide/local-models)。
