import type { DisclaimerId } from '../types';

// The first four sentences carry over verbatim from the previous site. These
// strings are the only place the claim guardrails allow regulated wording.
export const DISCLAIMERS: { readonly [Id in DisclaimerId]: string } = {
  normalOperation: '正常運作時，設定為不將患者資料傳送至外部 LLM',
  clinicalJudgment:
    '可從資訊搜尋、摘要、文件撰寫與研究支援開始導入，而非診斷本身。最終確認與判斷由醫療人員執行。',
  notReplacement: 'KOKODE 不取代醫療人員的判斷。',
  preview: '本網站為 KOKODE 的先行介紹，產品規格與提供內容可能隨開發進度變更。',
  screenImage: '※畫面為示意',
  fictionalPatient: '※患者資料為虛構',
  draftOnly: 'AI 輸出為草稿，請由醫療人員確認內容並作出最終判斷。',
};

/** Footnote text with exactly one leading reference mark. */
export function footnote(id: DisclaimerId): string {
  const text = DISCLAIMERS[id];
  return text.charAt(0) === '※' ? text : `※${text}`;
}
