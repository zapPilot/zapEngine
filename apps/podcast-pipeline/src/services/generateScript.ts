import type { Article } from '../types.js';
import { generateScriptWithLLM } from './llm.js';

export async function generateScript(article: Article) {
  return generateScriptWithLLM(article.title, article.text);
}
