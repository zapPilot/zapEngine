export const en = {
  'account.deleteTitle': 'Delete account',
  'account.deleteBody':
    'Permanently deletes your Zap Pilot account, linked wallets, and associated metadata. Your on-chain assets are never touched. Linked wallets can be added to another Zap Pilot account.',
  'account.deleteOpen': 'Delete Zap Pilot account',
  'account.deleteCancel': 'Cancel account deletion',
  'account.deleteWaiting': 'Waiting for signature…',
  'account.deleteConfirm': 'Sign & delete account',
  'account.deleteWarning':
    'This cannot be undone. Your wallet will ask you to sign a deletion message before anything is removed.',

  'account.walletLabel': 'Wallet label',
  'account.walletAddress': 'Wallet address',
  'account.manageWallets': 'Manage wallets',
  'account.approveEveryTransaction': 'You approve every transaction',
  'account.nonCustodialBody':
    'Zap Pilot can prepare routes, but your wallet must sign before anything moves.',
  'account.disconnectWallet': 'Disconnect wallet',
  'account.connectWallet': 'Connect wallet',
  'account.unavailableTitle': 'Account unavailable',
  'account.unavailableBody':
    'Your wallet is connected, but Zap Pilot couldn’t load your account. Retry to continue.',
  'account.settingsTitle': 'Settings',
  'account.iosAuthBody':
    'Signed in with Privy. The iOS app uses Privy only for account authentication.',
  'account.webFeaturesTitle': 'Read-only on iOS',
  'account.webFeaturesBody':
    'Portfolio viewing is read-only on iOS. Investing, rebalancing, and withdrawals are available on Zap Pilot Web.',
  'account.watchAddressTitle': 'Tracked portfolio address',
  'account.watchAddressBody':
    'If this Privy account has no Zap Pilot portfolio, enter an Ethereum address to view its portfolio in watch-only mode.',
  'account.watchAddressPlaceholder': '0x wallet address',
  'account.watchAddressSave': 'Save tracked address',
  'account.watchAddressClear': 'Clear tracked address',
  'account.watchAddressInvalid': 'Enter a valid 42-character Ethereum address.',
  'account.watchAddressSaved': 'Tracked address saved.',
  'account.signOut': 'Sign out',
} as const;

export const zhHant = {
  'account.deleteTitle': '刪除帳號',
  'account.deleteBody':
    '永久刪除 Zap Pilot 帳號、已連結的錢包與相關資料。鏈上資產不受影響，錢包可重新連結至其他 Zap Pilot 帳號。',
  'account.deleteOpen': '刪除 Zap Pilot 帳號',
  'account.deleteCancel': '取消刪除帳號',
  'account.deleteWaiting': '等待簽署…',
  'account.deleteConfirm': '簽署並刪除帳號',
  'account.deleteWarning': '此操作無法復原。刪除前，錢包會先請你簽署刪除訊息。',

  'account.walletLabel': '錢包名稱',
  'account.walletAddress': '錢包位址',
  'account.manageWallets': '管理錢包',
  'account.approveEveryTransaction': '每筆交易都由你確認',
  'account.nonCustodialBody':
    'Zap Pilot 可以準備交易路徑，但資產移動前仍需由你的錢包簽署。',
  'account.disconnectWallet': '中斷錢包連線',
  'account.connectWallet': '連接錢包',
  'account.unavailableTitle': '帳戶暫時無法使用',
  'account.unavailableBody':
    '錢包已連線，但 Zap Pilot 無法載入帳戶資料。請重試以繼續。',
  'account.settingsTitle': '設定',
  'account.iosAuthBody': '已透過 Privy 登入，iOS 版僅使用 Privy 進行帳戶驗證。',
  'account.webFeaturesTitle': 'iOS 為唯讀模式',
  'account.webFeaturesBody':
    'iOS 上僅提供投資組合唯讀查看；投資、再平衡與提領請至 Zap Pilot 網頁版。',
  'account.watchAddressTitle': '追蹤的投資組合位址',
  'account.watchAddressBody':
    '如果這個 Privy 帳號沒有 Zap Pilot 投資組合，可以輸入 Ethereum 位址，以 watch-only 模式查看。',
  'account.watchAddressPlaceholder': '0x 錢包位址',
  'account.watchAddressSave': '儲存追蹤位址',
  'account.watchAddressClear': '清除追蹤位址',
  'account.watchAddressInvalid': '請輸入有效的 42 字元 Ethereum 位址。',
  'account.watchAddressSaved': '已儲存追蹤位址。',
  'account.signOut': '登出',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'account.deleteTitle': 'アカウントを削除',
  'account.deleteBody':
    'Zap Pilot アカウント、連携ウォレットと関連データを完全に削除します。オンチェーンの資産には影響しません。ウォレットは別の Zap Pilot アカウントに連携できます。',
  'account.deleteOpen': 'Zap Pilot アカウントを削除',
  'account.deleteCancel': 'アカウント削除をキャンセル',
  'account.deleteWaiting': '署名を待っています…',
  'account.deleteConfirm': '署名してアカウントを削除',
  'account.deleteWarning':
    'この操作は取り消せません。削除前に、ウォレットで削除メッセージへの署名を求められます。',

  'account.walletLabel': 'ウォレット名',
  'account.walletAddress': 'ウォレットアドレス',
  'account.manageWallets': 'ウォレットを管理',
  'account.approveEveryTransaction': 'すべての取引を自分で承認',
  'account.nonCustodialBody':
    'Zap Pilotは取引ルートを準備しますが、資産が移動する前にウォレットでの署名が必要です。',
  'account.disconnectWallet': 'ウォレット接続を解除',
  'account.connectWallet': 'ウォレットを接続',
  'account.unavailableTitle': 'アカウントを利用できません',
  'account.unavailableBody':
    'ウォレットは接続されていますが、Zap Pilot がアカウント情報を読み込めませんでした。再試行してください。',
  'account.settingsTitle': '設定',
  'account.iosAuthBody':
    'Privyでサインイン中です。iOS版ではPrivyをアカウント認証のみに使用します。',
  'account.webFeaturesTitle': 'iOSでは閲覧専用',
  'account.webFeaturesBody':
    'iOSではポートフォリオを閲覧専用で確認できます。投資、リバランス、出金はZap Pilot Webをご利用ください。',
  'account.watchAddressTitle': '追跡するポートフォリオアドレス',
  'account.watchAddressBody':
    'このPrivyアカウントにZap Pilotのポートフォリオがない場合、Ethereumアドレスを入力して閲覧専用で確認できます。',
  'account.watchAddressPlaceholder': '0x ウォレットアドレス',
  'account.watchAddressSave': '追跡アドレスを保存',
  'account.watchAddressClear': '追跡アドレスを消去',
  'account.watchAddressInvalid':
    '42文字の有効なEthereumアドレスを入力してください。',
  'account.watchAddressSaved': '追跡アドレスを保存しました。',
  'account.signOut': 'サインアウト',
} satisfies Record<keyof typeof en, string>;
