export const en = {
  'common.pageNotFound': 'Page not found',
  'common.pageNotFoundBody':
    'This page is unavailable. Return to Podcast to continue.',
  'common.primaryNavigation': 'Primary',
  'common.signIn': 'Sign in',
  'common.back': 'Back',
  'common.close': 'Close',
  'common.chartRange': 'Chart range',
  'common.episodeOrder': 'Episode order',
  'common.cancel': 'Cancel',
  'common.pause': 'Pause',
  'common.play': 'Play',
  'common.retry': 'Retry',
  'common.seek': 'Seek',
} as const;

export const zhHant = {
  'common.pageNotFound': '找不到頁面',
  'common.pageNotFoundBody': '此頁面無法使用，請返回 Podcast 繼續。',
  'common.primaryNavigation': '主要導覽',
  'common.signIn': '登入',
  'common.back': '返回',
  'common.close': '關閉',
  'common.chartRange': '圖表區間',
  'common.episodeOrder': '單集順序',
  'common.cancel': '取消',
  'common.pause': '暫停',
  'common.play': '播放',
  'common.retry': '重試',
  'common.seek': '調整播放進度',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'common.pageNotFound': 'ページが見つかりません',
  'common.pageNotFoundBody':
    'このページは利用できません。Podcast に戻って続けてください。',
  'common.primaryNavigation': 'メインナビゲーション',
  'common.signIn': 'ログイン',
  'common.back': '戻る',
  'common.close': '閉じる',
  'common.chartRange': 'チャート期間',
  'common.episodeOrder': 'エピソードの順序',
  'common.cancel': 'キャンセル',
  'common.pause': '一時停止',
  'common.play': '再生',
  'common.retry': '再試行',
  'common.seek': '再生位置を変更',
} satisfies Record<keyof typeof en, string>;
