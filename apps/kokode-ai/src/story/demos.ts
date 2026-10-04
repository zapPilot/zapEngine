import type { DisclaimerId, FigureId } from './types';

// Demo screens show what using KOKODE looks like. Every patient detail is
// fictional; each demo names the disclaimers it must always be shown with.

export type DemoId = 'chat' | 'patient' | 'image';

/** Figures that are demo screens, and the demo each one shows. */
export const DEMO_FIGURES: { readonly [Id in FigureId]?: DemoId } = {
  experience: 'chat',
  demoPatient: 'patient',
  demoImage: 'image',
};

interface DemoBase {
  readonly caption: string;
  readonly prompt: string;
  readonly disclaimers: readonly DisclaimerId[];
}

export interface ChatDemo extends DemoBase {
  readonly address: string;
  readonly reply: readonly string[];
}

export interface PatientDemo extends DemoBase {
  readonly record: {
    readonly title: string;
    readonly lines: readonly string[];
  };
  readonly reply: { readonly title: string; readonly lines: readonly string[] };
}

export interface ImageDemo extends DemoBase {
  readonly sketch: string;
  readonly slide: { readonly title: string; readonly note: string };
  readonly steps: readonly string[];
}

export const DEMOS: {
  readonly chat: ChatDemo;
  readonly patient: PatientDemo;
  readonly image: ImageDemo;
} = {
  chat: {
    caption: 'スタッフのPCで開いたKOKODEのチャット画面',
    address: 'kokode.local',
    prompt: '院内マニュアルから、手指衛生のタイミングを3つにまとめてください',
    reply: [
      '1. 患者さんに触れる前と後',
      '2. 清潔・無菌の操作の前',
      '3. 体液に触れた可能性があるとき',
    ],
    disclaimers: ['screenImage'],
  },
  patient: {
    caption: '架空の患者の経過から、紹介状用の要約を下書きする例',
    prompt: 'この患者の経過を、紹介状用に要約してください',
    record: {
      title: '経過記録',
      lines: [
        '72歳 女性',
        '右大腿骨頸部骨折で入院',
        '人工骨頭置換術後 14日目',
        '既往歴：高血圧・2型糖尿病',
      ],
    },
    reply: {
      title: '紹介状用 経過要約（下書き）',
      lines: [
        '右大腿骨頸部骨折に対し、人工骨頭置換術を施行。',
        '術後経過は良好で、歩行器での歩行訓練を継続中。',
        '高血圧・2型糖尿病は内服を継続。',
      ],
    },
    disclaimers: ['fictionalPatient', 'screenImage', 'draftOnly'],
  },
  image: {
    caption: '線画の下書きをつくり、発表スライドに整える例',
    prompt: '発表資料用に、殿部の解剖図を作成してください',
    sketch: '殿部の解剖図（線画の下書き）',
    slide: { title: '殿部の解剖', note: '院内のAIで作成した下書き' },
    steps: ['線画をつくる', 'スライドに整える'],
    disclaimers: ['screenImage', 'draftOnly'],
  },
};

/** Labels of the chat window chrome, shared by the site and the film. */
export const CHAT_UI = {
  send: '送信',
  placeholder: 'AIに頼みたいことを入力',
  assistant: 'KOKODE',
  cloud: 'クラウドのAI',
} as const;
