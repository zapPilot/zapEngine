import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const PROMPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/script-system-prompt.txt',
);

describe('script system prompt output contract', () => {
  it('requires JSON with a minimally edited title and body-only narration', () => {
    const prompt = readFileSync(PROMPT_PATH, 'utf8');

    expect(prompt).toContain(
      '{"title":"編輯後標題","script":"一篇完整、可直接朗讀的 Podcast 正文"}',
    );
    expect(prompt).toContain(
      '以來源標題為基礎做最小必要改寫：目標只是避免逐字照抄，不是重新選角度、重新摘要或創作新標題。',
    );
    expect(prompt).toContain(
      '優先只改 1–2 個詞、語序或標點；來源標題若已清楚，保留原本句型與資訊結構。',
    );
    expect(prompt).toContain(
      '必須保留故事主體與核心辨識詞：原標題中的人名、公司名、產品名、協議名、資產名、必要數字與核心 claim。',
    );
    expect(prompt).toContain(
      '不得把 Fomo、Vector 這類具名實體抽象成「競品」「平台」「公司」等泛稱而失去辨識度。',
    );
    expect(prompt).toContain('不得捏造、篡改或新增原文沒有的結論');
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
