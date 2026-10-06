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
      '前几段首先要让人产生“为什么会这样？”',
      '不是固定写作格式',
      '问完必须马上回答',
      '同一个原则优先讲透一个最强案例',
      '这是给人听的，不是给人扫描阅读的',
      '不得因此虚构主持人的亲身经历',
      '补充原文没有支持的事实、数字、动机或结论',
      '收尾不要重新把全文内容列一次',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toContain('JSON');
  });
});
describe('title system prompt contract', () => {
  it('pins source-grounded desire-led titles with entity and investment boundaries', () => {
    const prompt = readPrompt('title');
    for (const anchor of [
      '不设字数目标',
      '不得与来源标题相同',
      '不得只是删减、调换个别字词或改动标点',
      '换一个切入点或句式',
      '不得新增来源标题没有的最高级、排名或定性',
      '只改变已有信息的表达，不增加信息',
      '不能用问号包装来源没有的推论',
      '来源中的疑问、引述、否定、约数与语气强度必须保留',
      '数字属于谁就始终属于谁',
      '不能把一家主体的涨幅写成整个赛道的涨幅',
      '读者视角',
      '不得扩大或泛化来源 claim 的范围',
      'USDT',
      '只选一个',
      '只能来自来源标题',
      '不替读者做投资决定',
      '人名、公司名、产品名、协议名、资产名、必要数字和核心 claim',
      '具名实体',
      '不得捏造',
      '公关腔',
      'clickbait',
      '使用简体中文',
      '只输出标题这一行',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toContain('20 个');
    expect(prompt).not.toContain('可以原样保留');
  });
});

describe('compression system prompt contract', () => {
  it('preserves claims and has no platform strategy', () => {
    const prompt = readPrompt('title-compression');
    for (const anchor of [
      'Best Title',
      'Unicode',
      '读者视角',
      '不得扩大或泛化来源 claim 的范围',
      'USDT',
      '输出语言和 Best Title 一致',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toMatch(/rednote|youtube|threads|小红书/iu);
  });
});
