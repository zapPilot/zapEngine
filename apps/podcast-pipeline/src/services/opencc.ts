import * as OpenCC from 'opencc-js';

import type { Article } from '../types.js';

const convertSimplifiedToTaiwan = OpenCC.Converter({ from: 'cn', to: 'twp' });

export function convertTextToZhTW(text: string): string {
  return convertSimplifiedToTaiwan(text);
}

export function convertArticleToZhTW(article: Article): Article {
  return {
    title: convertTextToZhTW(article.title),
    text: convertTextToZhTW(article.text),
  };
}
