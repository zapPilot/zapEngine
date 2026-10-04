import type { CopyShape } from '../types';
import type * as Japanese from '../ja/demos';

// Demo screens show what using KOKODE looks like. Every patient detail is
// fictional; each demo names the disclaimers it must always be shown with.

import { DEMO_FIGURES } from '../ja/demos';
export { DEMO_FIGURES };
export type { DemoId, ChatDemo, PatientDemo, ImageDemo } from '../ja/demos';
import type { ChatDemo, PatientDemo, ImageDemo } from '../ja/demos';

export const DEMOS: {
  readonly chat: ChatDemo;
  readonly patient: PatientDemo;
  readonly image: ImageDemo;
} = {
  chat: {
    caption: '員工電腦上的 KOKODE 聊天畫面',
    address: 'kokode.local',
    prompt: '請根據院內手冊，整理三個手部衛生時機',
    reply: ['1. 接觸患者前後', '2. 進行清潔或無菌操作前', '3. 可能接觸體液時'],
    disclaimers: ['screenImage'],
  },
  patient: {
    caption: '以虛構患者病程起草轉診摘要的例子',
    prompt: '請將這位患者的病程整理為轉診摘要',
    record: {
      title: '病程記錄',
      lines: [
        '72 歲女性',
        '因右側股骨頸骨折住院',
        '人工股骨頭置換術後第 14 天',
        '病史：高血壓、第二型糖尿病',
      ],
    },
    reply: {
      title: '轉診病程摘要（草稿）',
      lines: [
        '因右側股骨頸骨折接受人工股骨頭置換術。',
        '術後恢復良好，持續使用助行器進行步行訓練。',
        '高血壓與第二型糖尿病持續口服藥物。',
      ],
    },
    disclaimers: ['fictionalPatient', 'screenImage', 'draftOnly'],
  },
  image: {
    caption: '起草線稿並整理成簡報投影片的例子',
    prompt: '請為簡報繪製臀部解剖圖',
    sketch: '臀部解剖圖（線稿草稿）',
    slide: { title: '臀部解剖', note: '由院內 AI 製作的草稿' },
    steps: ['製作線稿', '整理成投影片'],
    disclaimers: ['screenImage', 'draftOnly'],
  },
};

/** Labels of the chat window chrome, shared by the site and the film. */
export const CHAT_UI: CopyShape<typeof Japanese.CHAT_UI> = {
  send: '傳送',
  placeholder: '輸入想交給 AI 的工作',
  assistant: 'KOKODE',
  cloud: '雲端 AI',
} as const;
