import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const EXPECTED_OPENING = '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。';
const PROMPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/script-system-prompt.txt',
);

describe('script system prompt output contract', () => {
  it('requires JSON with an editorial title and a directly readable script', () => {
    const prompt = readFileSync(PROMPT_PATH, 'utf8');

    expect(prompt).toContain(
      '{"title":"編輯後標題","script":"一篇完整、可直接朗讀的 Podcast 講稿"}',
    );
    expect(prompt).toContain('將來源標題改寫成 15–35 個中文字的編輯標題');
    expect(prompt).toContain('不得照抄來源標題');
    expect(prompt).toContain(
      '不得捏造或篡改必要的專名與數字；只有對標題核心有資訊價值的實體才需要保留。',
    );
    expect(prompt).toContain('不得新增原文沒有的結論');
    expect(prompt).toContain('禁止公關腔、誇大與 clickbait');
    expect(prompt).toContain(
      `script 欄位的第一句必須逐字為：「${EXPECTED_OPENING}」`,
    );
    expect(prompt).toContain(
      'script 欄位的第一個字必須是「各」，首句之前不得輸出任何內容。',
    );
    expect(prompt).toContain(
      'script 欄位不得輸出確認語、任務說明、標題、時間碼、Markdown 或分隔線。',
    );
    expect(prompt).toContain(
      'JSON 物件之外不得輸出任何內容，不得使用 Markdown code fence、註解或額外欄位。',
    );
  });
});
