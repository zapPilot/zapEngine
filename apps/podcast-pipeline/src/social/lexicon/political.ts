/**
 * A deliberately tiny tripwire. None of these belong in market coverage, so the
 * list exists to catch an accidental inclusion — a quoted headline, a scraped
 * article fragment — before it reaches Rednote review, not to filter topics.
 * Terms from konsheng/Sensitive-lexicon (MIT).
 *
 * Nothing that legitimately appears in this feed is listed: 台灣、香港、中國、
 * 央行、政策 and every jurisdiction name are ordinary reporting vocabulary.
 */
export const POLITICAL_TERMS = [
  '习近平',
  '李洪志',
  '法轮功',
  '大纪元',
  '新唐人',
  '六四事件',
  '天安门事件',
  '台独',
  '港独',
  '藏独',
  '疆独',
  '一党专政',
  '独裁政权',
  '颠覆国家',
  '煽动颠覆',
  '政权更迭',
  '白纸革命',
  '境外势力',
  '翻墙软件',
] as const;
