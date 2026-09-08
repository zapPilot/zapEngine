import { describe, expect, it } from 'vitest';

import { assertGeneratedScriptQuality } from './script-stage.js';

describe('assertGeneratedScriptQuality', () => {
  it.each(['...', '…', '......', '---', '。！？'])(
    'rejects placeholder-only script content: %j',
    (script) => {
      expect(() => assertGeneratedScriptQuality(script, '短文章內容')).toThrow(
        'LLM returned placeholder-only script content',
      );
    },
  );

  it('rejects a catastrophically short script for a long source article', () => {
    const source = '長文章內容'.repeat(2_500);
    const script = '這是一個遠遠不足以覆蓋原文的極短講稿。';

    expect(() => assertGeneratedScriptQuality(script, source)).toThrow(
      /LLM returned implausibly short script content/,
    );
  });

  it('accepts a script that clears the conservative long-source floor', () => {
    const source = '長文章內容'.repeat(2_500);
    const script = '完整講稿內容'.repeat(1_200);

    expect(() => assertGeneratedScriptQuality(script, source)).not.toThrow();
  });

  it('does not apply the source-ratio floor to short articles', () => {
    expect(() =>
      assertGeneratedScriptQuality(
        '簡短但有實質內容的講稿。',
        '短文章內容'.repeat(50),
      ),
    ).not.toThrow();
  });
});
