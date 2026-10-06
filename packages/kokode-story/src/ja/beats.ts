import type { Beat, BeatId } from '../types.js';

// Claims are fenced by packages/kokode-story/src/story.test.ts: when a guardrail fails, change the copy.
export const BEATS: { readonly [Id in BeatId]: Beat } = {
  hero: {
    eyebrow: 'AIを、ここで。',
    title: ['患者データを、', '外に出さないAI。'],
    body: [
      'チャットで気軽に頼めるAIを、院内のネットワークの中だけで。',
      '機器の準備から設定まで、KOKODEが導入します。',
    ],
    action: { label: 'パイロットを相談する' },
  },
  painPatient: {
    eyebrow: '課題：患者情報',
    title: ['AIに任せたい仕事ほど、', '患者情報が入っている。'],
    body: [
      '紹介状、退院サマリー、経過のまとめ。手間のかかる文書ほど、患者さんの情報なしには書けません。',
      '個人情報保護委員会も、生成AIサービスに個人情報を入力する際の注意を呼びかけています。',
    ],
    source: {
      label:
        '個人情報保護委員会「生成AIサービスの利用に関する注意喚起等について」（2023年6月2日）',
      href: 'https://www.ppc.go.jp/news/careful_information/230602_AI_utilize_alert/',
    },
  },
  painContent: {
    eyebrow: '課題：医療の画像',
    title: ['医療に必要な画像が、', 'つくれないことがある。'],
    body: [
      '解剖図や手術の説明図。医療では欠かせない画像でも、一般向けのAIサービスでは、利用ルールによって生成が制限される場合があります。',
    ],
  },
  desiredWorld: {
    eyebrow: 'ほしいのは',
    title: ['ChatGPTのように自然に。', 'でも、院内の管理下で。'],
    body: [
      '頼めば、すぐに返ってくる。文書の下書きも、説明用の図も。その手軽さを、患者データを外に出さずに。',
    ],
  },
  solution: {
    eyebrow: 'KOKODE',
    title: ['院内で動く、', '施設専用のAI。'],
    body: [
      'KOKODEは、院内に置いた機器の上でAIを動かします。患者データを扱う作業も、院内で完結させる構成です。',
    ],
    notes: ['normalOperation'],
  },
  beforeAfter: {
    eyebrow: 'データの行き先',
    title: ['患者データは、', '院内のAIへ。'],
    figure: 'beforeAfter',
    notes: ['normalOperation'],
  },
  experience: {
    eyebrow: '使い方',
    title: ['ブラウザを開けば、', 'いつものように。'],
    body: [
      'スタッフ用ネットワークにつながったPCやタブレットで、ブラウザから kokode.local を開くだけ。ChatGPTと同じように、チャットで頼めます。サーバーの前に座る必要はありません。',
    ],
    figure: 'experience',
  },
  boundary: {
    eyebrow: 'つながる範囲',
    title: ['院内にいるときだけ', '使えるAI。'],
    body: [
      'KOKODEを使えるのは、スタッフ用ネットワークにつながり、ログインした端末だけ。院外からは、つながりません。患者さん用のWi-Fiとも分けて設定します。',
    ],
    figure: 'boundary',
  },
  demoPatient: {
    eyebrow: '活用例：紹介状',
    title: ['経過の要約を、', '院内で下書き。'],
    body: [
      'カルテの経過から、紹介状に使う要約の下書きをつくります。確認と仕上げは、先生の手で。',
    ],
    figure: 'demoPatient',
    notes: ['clinicalJudgment'],
    action: { label: 'この業務で試したい', interest: 'referral' },
  },
  demoImage: {
    eyebrow: '活用例：説明用の図',
    title: ['発表資料の図も、', '院内で下書き。'],
    body: [
      '「殿部の解剖図を」と頼めば、線画の下書きをつくり、発表用のスライドに整えます。',
    ],
    figure: 'demoImage',
    action: { label: 'この業務で試したい', interest: 'materials' },
  },
  turnkey: {
    eyebrow: 'まとめて導入',
    title: ['導入はKOKODE、', '使うのは院内のチーム。'],
    body: [
      '機器、AIモデル、業務に合わせたエージェント、スタッフが使うチャット画面。ひとそろいでKOKODEが導入し、設定します。',
      '導入後も、モデルやエージェントの更新と運用のご相談に対応します。更新の届け方は、施設のネットワーク方針に合わせて決めます。',
    ],
    figure: 'turnkey',
  },
  startSmall: {
    eyebrow: 'はじめ方',
    title: ['まずは1台、', '1つの業務から。'],
    body: [
      'GPUラックは、最初から要りません。小さな機器1台で、1つの業務を試すところから始められます。',
      '規模が大きくなったときは、機器の構成も施設に合わせてご相談いただけます。',
    ],
    figure: 'hardware',
    notes: ['hardwareImage'],
    price: {
      label: 'PoC',
      amount: '30万円〜',
      note: 'パイロット（導入検証）の参考価格です。内容に応じて個別にお見積りします。',
    },
  },
  pilot: {
    eyebrow: 'パイロット',
    title: ['1つの業務で、', '院内で試す。'],
    points: [
      {
        title: '業務を1つ選ぶ',
        text: 'クラウドには出せないけれど、AIに任せたい業務を1つ。紹介状の作成、院内文書の検索、説明資料づくり、音声からの文書化などから選べます。',
      },
      {
        title: '院内に1台置く',
        text: '機器の準備から設定まで、KOKODEが行います。',
      },
      {
        title: '実際に使ってみる',
        text: 'スタッフがブラウザから使い、効果を一緒に確かめます。',
      },
    ],
  },
  cta: {
    eyebrow: 'ご相談',
    title: [
      'クラウドには出せないけれど',
      'AIに任せたい業務を、',
      '1つお持ちください。',
    ],
    body: [
      '試したい業務をお知らせください。パイロットの進め方をご案内します。',
    ],
    notes: ['notReplacement'],
    action: { label: '試したい業務を相談する' },
  },
  partnerDemand: {
    eyebrow: '販売パートナーの皆さまへ',
    title: ['お客様は、', 'AIを求めている。'],
    body: [
      'AIを使いたい。でも、患者データは外に出せない。医療機関のこの悩みに、院内で動くAIで応えます。',
    ],
  },
  partnerGap: {
    eyebrow: 'パートナーの役割',
    title: ['AIエンジニアも、', 'GPUの知見も、要りません。'],
    body: [
      '機器の選定、AIモデルの設定、導入後のサポートはKOKODEが担当します。お客様とのつながりを生かして、ご紹介ください。',
    ],
  },
  partnerRoles: {
    eyebrow: '役割分担',
    title: ['パートナーと', 'KOKODEで、', '医療機関を支える。'],
    figure: 'partnerRoles',
  },
  partnerCta: {
    eyebrow: 'はじめ方',
    title: ['まずは1施設で、', '一緒に。'],
    body: [
      '最初の1施設を、パートナーの皆さまと一緒に導入します。ご紹介先の候補があれば、ご相談ください。',
    ],
    action: { label: 'パートナーとして相談する', interest: 'partner' },
  },
};
