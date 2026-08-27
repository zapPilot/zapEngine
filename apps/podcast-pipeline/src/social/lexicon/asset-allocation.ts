/**
 * R1 資產配置指導 — wording that tells a reader how much of an asset to hold.
 * Rednote's finance review treats an allocation verdict as investment advice
 * even when it is attributed to a named investor, which is how a note quoting
 * 「低配債券、超配黃金」 was removed while every solicitation term in
 * ./finance.ts stayed clean.
 *
 * Precision rule, and why some obvious candidates are missing:
 *
 * - `加碼`/`減碼` are deliberately absent. 「央行加碼寬鬆」、「政府加碼補助」 are
 *   ordinary macro reporting in this feed, so listing them would fail copy
 *   generation on posts that carry no investment direction at all.
 * - `建倉`/`平倉` are absent for the same reason: they are the neutral mechanics
 *   an explainer about perpetuals or liquidation has to name.
 * - `增持`/`減持` are absent because they are the standard verb for reporting a
 *   filing or a treasury move, not for telling a reader what to do.
 * - `加倉`/`減倉`/`低配`/`超配` are two characters, against the three-character
 *   preference in ./index.ts. They are kept because in Chinese financial writing
 *   they carry no meaning other than a position direction, and the post that was
 *   lost used exactly this form.
 */
export const ASSET_ALLOCATION_TERMS = [
  // 配置方向
  '低配',
  '超配',
  '加仓',
  '减仓',
  '补仓',
  '空仓',
  '满仓',
  // 配置比例
  '配置比例',
  '仓位配置',
  '建议配置',
  '配置建议',
  '提高配置',
  '降低配置',
  '该配置',
  '该买多少',
  '该持有多少',
] as const;
