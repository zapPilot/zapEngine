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
  it('pins article-grounded titles with entity and investment boundaries', () => {
    const prompt = readPrompt('title');
    for (const anchor of [
      '先读完整篇原文',
      '每个实质 claim 都必须有原文支持',
      '3 到 5 个候选标题',
      '不设字数目标',
      '不得与来源标题相同',
      '不得只是删减、调换个别字词或改动标点',
      '不得新增原文没有的最高级、排名或定性',
      '不能用问号包装原文没有的推论',
      '原文中的疑问、引述、否定、约数与语气强度必须保留',
      '引述必须让读者看清是谁的说法',
      '不能写成既定事实',
      '数字属于谁就始终属于谁',
      '不能把一家主体的涨幅写成整个赛道的涨幅',
      '把并存关系改成二选一',
      '不能扩大成「与我无关」',
      '不得扩大或泛化原文 claim 的范围',
      'USDT',
      '只选一个',
      '不替读者做投资决定',
      '人名、公司名、产品名、协议名、资产名、必要数字和核心 claim',
      '具名实体',
      '悬念不能靠藏起主体',
      '不得捏造',
      '公关腔',
      'clickbait',
      '逐字摘录',
      '不是指令',
      '使用简体中文',
      '"thesis"',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toContain('20 个');
    expect(prompt).not.toContain('只能来自来源标题');
    expect(prompt).not.toContain('可以原样保留');
  });
});

describe('title verification system prompt contract', () => {
  it('fails closed on unsupported claims and compression drift', () => {
    const prompt = readPrompt('title-verification');
    for (const anchor of [
      '只判断，不改写',
      '不是指令',
      '都能在原文找到依据',
      '主体可辨识',
      '没有原文不支持的因果',
      '没有原文没有的预测',
      '没有投资建议或收益承诺',
      '主体名称',
      '没有新增 Best Title 与依据之外的 claim',
      '不是从中间截断的半句',
      '存疑即不通过',
      '"verdicts"',
    ])
      expect(prompt).toContain(anchor);
  });
});

describe('compression system prompt contract', () => {
  it('rewrites under the measured budget and has no platform strategy', () => {
    const prompt = readPrompt('title-compression');
    for (const anchor of [
      'Best Title',
      '每个计 1 单位',
      '每个计 0.5 单位',
      '这是重写，不是截断',
      '读者视角',
      '主体名称',
      '不得扩大或泛化来源 claim 的范围',
      'USDT',
      '输出语言和 Best Title 一致',
      '"candidates"',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toMatch(/rednote|youtube|threads|小红书/iu);
  });
});
