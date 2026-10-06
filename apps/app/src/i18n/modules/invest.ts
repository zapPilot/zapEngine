export const en = {
  'invest.amount.intro':
    'Choose an amount and a mix. Zap Pilot builds and checks the transactions; nothing moves until you sign.',
  'invest.amount.defaultMixNote':
    'Default mix: {crypto}% crypto · {stable}% stable. A starting point, not a recommendation. Edit one sector and the others adjust to 100%.',
  'invest.amount.resetMix': 'Reset to the default mix',
} as const;

export const zhHant = {
  'invest.amount.intro':
    '選擇金額與配置。Zap Pilot 會建立並檢查交易；在你簽署之前，資產不會移動。',
  'invest.amount.defaultMixNote':
    '預設配置：加密 {crypto}% · 穩定 {stable}%。這只是起點，並非建議。調整任一類別，其餘會自動調整至合計 100%。',
  'invest.amount.resetMix': '重設為預設配置',
} satisfies Record<keyof typeof en, string>;

export const ja = {
  'invest.amount.intro':
    '金額と配分を選んでください。Zap Pilotが取引を作成・検証します。署名するまで資産は動きません。',
  'invest.amount.defaultMixNote':
    'デフォルト配分：暗号資産 {crypto}%・ステーブル {stable}%。出発点であり、推奨ではありません。1つのセクターを変更すると、残りは合計100%になるよう調整されます。',
  'invest.amount.resetMix': 'デフォルト配分に戻す',
} satisfies Record<keyof typeof en, string>;
