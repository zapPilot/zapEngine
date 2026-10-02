import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { errorMessage } from '../lib/errorMessage.js';
import { logIngestEvent } from './ingest/step.js';
import {
  completionMetadata,
  createCompletionWithRetry,
  getOpenRouterConfig,
} from './llm.js';

export function normalizeEditorialTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  let normalized = value.trim().replace(/^(?:标题|標題)：\s*/u, '');
  const quotePairs: readonly (readonly [string, string])[] = [
    ['"', '"'],
    ["'", "'"],
    ['‘', '’'],
    ['“', '”'],
    ['「', '」'],
    ['『', '』'],
  ];
  let strippedQuotes = true;
  while (strippedQuotes && normalized.length >= 2) {
    strippedQuotes = false;
    for (const [opening, closing] of quotePairs) {
      if (normalized.startsWith(opening) && normalized.endsWith(closing)) {
        normalized = normalized.slice(opening.length, -closing.length).trim();
        strippedQuotes = true;
        break;
      }
    }
  }

  if (
    /[\r\n]/u.test(normalized) ||
    /^(?:#{1,6}(?:\s|$)|[-*+]\s|>\s?|`|[*_]{1,2}\S|~~)/u.test(normalized)
  ) {
    return null;
  }

  const characterCount = [...normalized].length;
  if (characterCount < 4 || characterCount > 60) return null;

  return normalized;
}

export async function generateEditorialTitleWithLLM(
  sourceTitle: string,
): Promise<{
  title: string | null;
  model: string;
  provider: string;
  costUsd: number;
}> {
  let model = 'unknown';
  let provider = 'unknown';
  let costUsd = 0;
  let previousTitle: string | null = null;
  let reason = 'invalid_title';
  try {
    const config = getOpenRouterConfig({ thinkingModel: null });
    model = config.model;
    const system = readFileSync(
      fileURLToPath(
        new URL('../../prompts/title-system-prompt.txt', import.meta.url),
      ),
      'utf8',
    );
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const completion = await createCompletionWithRetry(
        config.openai,
        {
          model: config.model,
          messages: [
            { role: 'system', content: system },
            {
              role: 'user',
              content:
                attempt === 1
                  ? sourceTitle
                  : `${sourceTitle}\n\n上一个标题不符合要求（${reason}）。请只输出标题这一行，控制在 20 个 Unicode 字符以内。`,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        },
        null,
        'generateEditorialTitle',
        { reasoning: { enabled: false } },
      );
      const metadata = completionMetadata(completion, config.model, null);
      model = metadata.model;
      provider = metadata.provider;
      costUsd += metadata.costUsd;
      const choice = completion.choices[0]!;
      const title =
        choice.finish_reason === 'length'
          ? null
          : normalizeEditorialTitle(choice.message.content);
      if (title !== null) {
        if (attempt === 2 || [...title].length <= 20)
          return { title, model, provider, costUsd };
        previousTitle = title;
        reason = `上一个标题 ${[...title].length} 个字，超过 20 字`;
      } else {
        reason =
          choice.finish_reason === 'length' ? 'truncated' : 'invalid_title';
      }
    }
  } catch (error) {
    reason = `transport: ${errorMessage(error)}`;
    logIngestEvent('llm:title-fallback', { reason });
    return { title: null, model, provider, costUsd };
  }
  if (previousTitle === null) logIngestEvent('llm:title-fallback', { reason });
  return { title: previousTitle, model, provider, costUsd };
}
