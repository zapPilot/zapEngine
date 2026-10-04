// Labels of the diagrams. They are real text on every surface (HTML and
// film), never baked into an image, so they stay searchable and reviewable.
export const FIGURES = {
  beforeAfter: {
    caption: '患者データの行き先：これまでのクラウドのAIと、KOKODE',
    inside: '院内',
    before: {
      label: 'これまで',
      steps: ['患者データ', 'クラウドのAI', '不安・制限'],
    },
    after: {
      label: 'KOKODE',
      steps: ['患者データ', 'KOKODE', '院内のAI'],
    },
  },
  boundary: {
    caption:
      'KOKODEにつながるのは、院内のスタッフ用ネットワークでログインした端末だけ',
    inside: '院内',
    network: 'スタッフ用ネットワーク',
    devices: ['PC', 'タブレット'],
    login: 'ログイン',
    server: 'KOKODE',
    guest: '患者さん用Wi-Fi',
    outside: '院外',
    blocked: 'つながらない',
  },
  turnkey: {
    caption: 'KOKODEがまとめて導入するもの',
    layers: [
      { title: 'チャット画面', text: 'スタッフがブラウザで使う' },
      { title: 'エージェント', text: '業務に合わせた手順' },
      { title: 'AIモデル', text: '院内の機器で動かす' },
      { title: 'ハードウェア', text: '院内に置く機器' },
    ],
    hardwareAlt: 'KOKODEが院内に設置する機器のイメージ',
  },
  partnerRoles: {
    caption: '医療機関・パートナー・KOKODEの役割分担',
    client: { title: '医療機関', text: '院内でAIを使う' },
    partner: { title: 'パートナー', text: 'ご紹介・お客様の窓口' },
    kokode: { title: 'KOKODE', text: '導入・設定・サポート' },
  },
} as const;
