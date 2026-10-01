export const en = {
  'language.title': 'Language',
  'language.description':
    'Changes the app interface and podcast language. Listening history is preserved.',
  'language.choose': 'Choose app language',
  'language.closeMenu': 'Close language menu',
  'language.noEpisodes': 'No episodes yet',
  'language.progress':
    '{name}, {completed} of {total} episodes completed, {percentage}%',
  'language.japanese': 'Japanese',
  'language.english': 'English',
} as const;

export const zhHant = {
  'language.title': '語言',
  'language.description': '同步切換 App 介面與 Podcast 語言，收聽紀錄會保留。',
  'language.choose': '選擇 App 語言',
  'language.closeMenu': '關閉語言選單',
  'language.noEpisodes': '尚無節目',
  'language.progress': '{name}，已聽完 {completed} / {total} 集，{percentage}%',
  'language.japanese': '日語',
  'language.english': '英語',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'language.title': '言語',
  'language.description':
    'アプリの表示言語とポッドキャストの言語を同時に切り替えます。再生履歴は保持されます。',
  'language.choose': 'アプリの言語を選択',
  'language.closeMenu': '言語メニューを閉じる',
  'language.noEpisodes': 'エピソードはまだありません',
  'language.progress':
    '{name}、{total}話中{completed}話を再生済み、{percentage}%',
  'language.japanese': '日本語',
  'language.english': '英語',
} satisfies Record<keyof typeof en, string>;
