export const en = {
  'tabs.home': 'Home',
  'tabs.strategy': 'Strategy',
  'tabs.podcast': 'Podcast',
  'tabs.account': 'Account',
  'tabs.signInHint': 'Open this tab to continue with Privy',
  'tabs.bar': 'App tabs',
} as const;

export const zhHant = {
  'tabs.home': '首頁',
  'tabs.strategy': '策略',
  'tabs.podcast': 'Podcast',
  'tabs.account': '帳戶',
  'tabs.signInHint': '開啟此分頁並透過 Privy 繼續',
  'tabs.bar': '應用程式分頁',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'tabs.home': 'ホーム',
  'tabs.strategy': 'ストラテジー',
  'tabs.podcast': 'ポッドキャスト',
  'tabs.account': 'アカウント',
  'tabs.signInHint': 'このタブを開き、Privyで続行します',
  'tabs.bar': 'アプリのタブ',
} satisfies Record<keyof typeof en, string>;
