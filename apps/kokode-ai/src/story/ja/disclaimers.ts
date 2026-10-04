import type { DisclaimerId } from '../types';

// The first four sentences carry over verbatim from the previous site. These
// strings are the only place the claim guardrails allow regulated wording.
export const DISCLAIMERS: { readonly [Id in DisclaimerId]: string } = {
  normalOperation: '通常運用では患者データを外部LLMへ送信しない構成',
  clinicalJudgment:
    '診断そのものではなく、情報の検索・要約・文書作成・研究支援から導入できます。最終確認と判断は医療従事者が行います。',
  notReplacement: 'KOKODEは医療従事者による判断を代替するものではありません。',
  preview:
    '本サイトはKOKODEの先行案内ページです。製品仕様・提供内容は開発状況により変更される場合があります。',
  screenImage: '※画面はイメージです',
  fictionalPatient: '※架空の患者データです',
  draftOnly:
    'AIの出力は下書きです。内容の確認と最終的な判断は、医療従事者が行ってください。',
};

/** Footnote text with exactly one leading reference mark. */
export function footnote(id: DisclaimerId): string {
  const text = DISCLAIMERS[id];
  return text.charAt(0) === '※' ? text : `※${text}`;
}
