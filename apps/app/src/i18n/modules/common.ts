export const en = {
  'common.back': 'Back',
  'common.cancel': 'Cancel',
  'common.pause': 'Pause',
  'common.play': 'Play',
  'common.retry': 'Retry',
  'common.seek': 'Seek',
} as const;

export const zhHant = {
  'common.back': '返回',
  'common.cancel': '取消',
  'common.pause': '暫停',
  'common.play': '播放',
  'common.retry': '重試',
  'common.seek': '調整播放進度',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'common.back': '戻る',
  'common.cancel': 'キャンセル',
  'common.pause': '一時停止',
  'common.play': '再生',
  'common.retry': '再試行',
  'common.seek': '再生位置を変更',
} satisfies Record<keyof typeof en, string>;
