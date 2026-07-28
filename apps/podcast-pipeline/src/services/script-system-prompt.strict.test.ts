import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const EXPECTED_OPENING = '各位觀眾朋友，歡迎收聽今天的 Zap Podcast。';
const PROMPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../prompts/script-system-prompt.txt',
);

describe('script system prompt opening contract', () => {
  it('requires the exact opening before any other generated content', () => {
    const prompt = readFileSync(PROMPT_PATH, 'utf8');

    expect(prompt).toContain(
      `輸出的第一句必須逐字為：「${EXPECTED_OPENING}」`,
    );
    expect(prompt).toContain('第一個字必須是「各」，首句之前不得輸出任何內容。');
    expect(prompt).toContain(
      '不得輸出確認語、任務說明、標題、時間碼、Markdown 或分隔線。',
    );
  });
});
