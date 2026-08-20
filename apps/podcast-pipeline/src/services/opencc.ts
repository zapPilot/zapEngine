import * as OpenCC from 'opencc-js';

import type { Article } from '../types.js';

const convertSimplifiedToTaiwan: (text: string) => string = OpenCC.Converter({
  from: 'cn',
  to: 'twp',
});

// The exact mirror of the conversion above, phrase level included: a lexicon
// authored in Mainland vocabulary must still match Taiwanese phrasing of the
// same term (網路 -> 网络, 軟體 -> 软件). Used to normalize copy before matching,
// never to publish — published copy is always Traditional.
const convertTaiwanToSimplified: (text: string) => string = OpenCC.Converter({
  from: 'twp',
  to: 'cn',
});

export function convertTextToZhTW(text: string): string {
  return convertSimplifiedToTaiwan(text);
}

export function convertTextToZhCN(text: string): string {
  return convertTaiwanToSimplified(text);
}

export function convertArticleToZhTW(article: Article): Article {
  return {
    title: convertTextToZhTW(article.title),
    text: convertTextToZhTW(article.text),
  };
}
