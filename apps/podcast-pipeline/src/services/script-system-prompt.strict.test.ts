import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const readPrompt = (name: string) =>
  readFileSync(
    new URL(`../../prompts/${name}-system-prompt.txt`, import.meta.url),
    'utf8',
  );
describe('script system prompt contract', () => {
  it('pins the plain text understanding path', () => {
    const prompt = readPrompt('script');
    for (const anchor of [
      '只输出可以直接朗读的文章正文本身',
      '不要标题、开场招呼',
      '使用简体中文',
      '不要 Markdown',
      '命题 → 疑问 → 解释 → 证据 → 原则',
      '问完必须马上回答',
      '不得因此虚构主持人的亲身经历',
      '补充原文没有支持的事实、数字、动机或结论',
      '收尾不要重新把全文内容列一次',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toContain('JSON');
  });
});
describe('title system prompt contract', () => {
  it('pins minimal source title edits', () => {
    const prompt = readPrompt('title');
    for (const anchor of [
      '最小必要改写',
      '优先只改 1–2 个词',
      '20 个 Unicode',
      '超过 20 字时才',
      '人名、公司名、产品名、协议名、资产名、必要数字和核心 claim',
      '具名实体',
      '不得捏造',
      '公关腔',
      'clickbait',
      '使用简体中文',
      '只输出标题这一行',
    ])
      expect(prompt).toContain(anchor);
  });
});
