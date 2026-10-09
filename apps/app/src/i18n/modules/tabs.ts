export const en = {
  'tabs.today': 'Today',
  'tabs.listen': 'Listen',
  'tabs.runtime': 'Runtime',
  'tabs.home': 'Home',
  'tabs.strategy': 'Strategy',
  'tabs.podcast': 'Podcast',
  'tabs.account': 'Account',
  'tabs.bar': 'App tabs',
} as const;

export const zhHant = {
  'tabs.today': '今日',
  'tabs.listen': '收聽',
  'tabs.runtime': '執行環境',
  'tabs.home': '首頁',
  'tabs.strategy': '策略',
  'tabs.podcast': 'Podcast',
  'tabs.account': '帳戶',
  'tabs.bar': '應用程式分頁',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'tabs.today': '今日',
  'tabs.listen': '聴く',
  'tabs.runtime': '実行環境',
  'tabs.home': 'ホーム',
  'tabs.strategy': 'ストラテジー',
  'tabs.podcast': 'ポッドキャスト',
  'tabs.account': 'アカウント',
  'tabs.bar': 'アプリのタブ',
} satisfies Record<keyof typeof en, string>;
