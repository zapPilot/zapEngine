export const en = {
  'financialFeature.readOnlyTitle': 'Read-only on iOS',
  'financialFeature.readOnlyBody': 'Portfolio viewing is read-only on iOS.',
} as const;

export const zhHant = {
  'financialFeature.readOnlyTitle': 'iOS 為唯讀模式',
  'financialFeature.readOnlyBody': 'iOS 上僅提供投資組合唯讀查看。',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'financialFeature.readOnlyTitle': 'iOSでは閲覧専用',
  'financialFeature.readOnlyBody':
    'iOSではポートフォリオを閲覧専用で確認できます。',
} satisfies Record<keyof typeof en, string>;
