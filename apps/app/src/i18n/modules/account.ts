export const en = {
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
