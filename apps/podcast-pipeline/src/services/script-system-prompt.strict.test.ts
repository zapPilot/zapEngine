import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const readPrompt = (name: string) =>
  readFileSync(
    new URL(`../../prompts/${name}-system-prompt.txt`, import.meta.url),
    'utf8',
  );
describe('script system prompt contract', () => {
  it('pins the plain-text storytelling contract and its grounding guards', () => {
    const prompt = readPrompt('script');
    for (const anchor of [
      // Output contract enforced again by generatedScriptBodyViolation.
      '只输出可以直接朗读的文章正文本身',
      '不要标题、开场招呼',
      '使用简体中文',
      '不要 Markdown',
      '第一句不要用“各位”',
      '“还记得……吗”',
      '不对听众提要求',
      '不要把核对过程写出来',
      // Understanding path.
      '命题 → 疑问 → 解释 → 证据 → 原则',
      '不是固定写作格式',
      '问完必须马上回答',
      '同一个原则优先讲透一个最强案例',
      '这是给人听的，不是给人扫描阅读的',
      '收尾不要重新把全文内容列一次',
      // One source-supported reason to listen.
      '只选一个',
      '这个理由只能来自原文',
      '不要硬找一个共同主题',
      // Length: keeps video under Rednote's 15 minutes.
      '不要为了凑长度',
      '三千五百字以内',
      // Grounding: each of these was violated by an A/B sample before it was
      // added (invented quote, self-computed percentage, recalled date and
      // amount, an author's feelings voiced as the host's).
      '补充原文没有支持的事实、数字、动机或结论',
      '必须听得出是比方或假设',
      '里面不放任何数字',
      '不得虚构主持人的亲身经历',
      '不要引用原文里没有的任何人说过的话',
      '哪怕是真的，原文没写就不要加',
      '不要自己做任何计算',
      '原文没给总数，就不要自己加总',
      '主讲人不能接过来当成自己的或听众的',
      // Financial red lines (narration ships as subtitles and feeds social copy).
      '不对价格涨跌',
      '要说清楚是谁的看法',
      '不替听众做投资决定',
      '不替任何项目、资产或机构做宣传',
      '炒币黑话',
      '引号、括号和破折号在声音里听不出来',
    ])
      expect(prompt).toContain(anchor);
    expect(prompt).not.toContain('JSON');
    // Naming a reference host made the A/B arm ignore explicit bans, and
    // quoting a banned transition made the model use it more often.
    expect(prompt).not.toContain('樊登');
    expect(prompt).not.toContain('问题来了');
  });
});
describe('title system prompt contract', () => {
  it('pins source-grounded desire-led titles with entity and investment boundaries', () => {
    const prompt = readPrompt('title');
    for (const anchor of [
      '不设字数目标',
      '可以原样保留',
      '不要为了改写而改写',
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
    expect(prompt).not.toContain('不要逐字照抄');
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
