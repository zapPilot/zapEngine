export const en = {
  'financialFeature.readOnlyTitle': 'Read-only on iOS',
  'financialFeature.readOnlyBody':
    'Portfolio viewing is read-only on iOS. Investing, rebalancing, and withdrawals are available on Zap Pilot Web.',
} as const;

export const zhHant = {
  'financialFeature.readOnlyTitle': 'iOS 為唯讀模式',
  'financialFeature.readOnlyBody':
    'iOS 上僅提供投資組合唯讀查看；投資、再平衡與提領請至 Zap Pilot 網頁版。',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'financialFeature.readOnlyTitle': 'iOSでは閲覧専用',
  'financialFeature.readOnlyBody':
    'iOSではポートフォリオを閲覧専用で確認できます。投資、リバランス、出金はZap Pilot Webをご利用ください。',
} satisfies Record<keyof typeof en, string>;
