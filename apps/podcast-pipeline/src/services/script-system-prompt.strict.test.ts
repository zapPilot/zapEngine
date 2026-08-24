import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PROMPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/script-system-prompt.txt',
);

describe('script system prompt output contract', () => {
  it('requires JSON with an editorial title and body-only narration', () => {
    const prompt = readFileSync(PROMPT_PATH, 'utf8');

    expect(prompt).toContain(
      '{"title":"編輯後標題","script":"一篇完整、可直接朗讀的 Podcast 正文"}',
    );
    expect(prompt).toContain('將來源標題改寫成 15–35 個中文字的編輯標題');
    expect(prompt).toContain('不得照抄來源標題');
    expect(prompt).toContain(
      '不得捏造或篡改必要的專名與數字；只有對標題核心有資訊價值的實體才需要保留。',
    );
    expect(prompt).toContain('不得新增原文沒有的結論');
    expect(prompt).toContain('禁止公關腔、誇大與 clickbait');
    expect(prompt).toContain(
      '只撰寫節目正文。不得加入節目迎賓詞、節目名稱、CTA、廣告詞或收尾導流；這些由 application code 統一加入。',
    );
    expect(prompt).toContain(
      '第一個字就必須開始正文內容，不得先打招呼、歡迎聽眾或介紹 Zap Podcast。',
    );
    expect(prompt).toContain(
      '最後一句必須是正文自然結束，不得加入 Zap Pilot、訂閱、按讚、分享、網站或任何 CTA。',
    );
    expect(prompt).toContain(
      'script 欄位不得輸出確認語、任務說明、標題、時間碼、Markdown 或分隔線。',
    );
    expect(prompt).toContain(
      'JSON 物件之外不得輸出任何內容，不得使用 Markdown code fence、註解或額外欄位。',
    );
  });
});
