#!/usr/bin/env node
// Content-layer guard for the language classroom (語言小教室) generator.
//
// The audio-artifact invariant (two separate HLS sections) is enforced by
// schema constraints and the strict audio-stage tests. This script guards the
// *content* layer, which has no schema/DB enforcement: the classroom lesson LLM
// must stay grounded in the article and script, not just the title. A previous
// regression silently narrowed the prompt to the title alone and rewrote the
// unit test in the same diff, so a co-editable unit test is not enough. This
// gate reads llm.ts source directly and runs inside `lint`, independent of the
// vitest suite.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const llmPath = fileURLToPath(new URL('../src/services/llm.ts', import.meta.url));
const source = readFileSync(llmPath, 'utf8');

const failures = [];

function requireContains(label, needle) {
  if (!source.includes(needle)) {
    failures.push(`${label}: expected llm.ts to contain \`${needle}\``);
  }
}

// The classroom generator must accept article + script grounding, not just the title.
requireContains('LanguageClassroomInput.articleText', 'articleText: string;');
requireContains('LanguageClassroomInput.script', 'script: string;');

// The user message the model actually receives must carry the grounding context.
requireContains('user message article grounding', '文章內容：');
requireContains('user message script grounding', 'Podcast 講稿：');
requireContains('user message title', '標題：');
requireContains('user message reads articleText', 'input.articleText');
requireContains('user message reads script', 'input.script');

// Each lesson must also carry a 100%-target-language TTS narration script,
// grounded the same way as the keywords, not a translation of the title/oneLiner.
requireContains('lesson response schema has a script field', '"script"');
requireContains('classroom script purity rule', '一律只使用目標語言');
requireContains('classroom script grounding rule', '內容必須根據文章與講稿');

if (failures.length > 0) {
  console.error(
    'Language classroom content contract broken (see apps/podcast-pipeline/CLAUDE.md "Audio section invariant"):',
  );
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  console.error(
    '\nThe classroom lesson prompt must stay grounded in the article and script. ' +
      'Do not narrow it to the title as a "simplification". Changing this contract ' +
      'requires explicit product sign-off, not an incidental edit.',
  );
  process.exit(1);
}

console.log('Language classroom content contract OK (article/script grounding present).');
