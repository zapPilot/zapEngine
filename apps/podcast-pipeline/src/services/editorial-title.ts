import { readFileSync } from 'node:fs';

import { errorMessage } from '../lib/errorMessage.js';
import { buildLlmCostLine, type UsageCostLine } from './cost.js';
import { logIngestEvent } from './ingest/step.js';
import {
  completionMetadata,
  createCompletionWithRetry,
  getOpenRouterConfig,
} from './llm.js';
import { convertTextToZhCN } from './opencc.js';
import { fitTitleToBudget, type TitleVariants } from './title-variants.js';

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

interface EditorialTitleResult {
  title: string | null;
  model: string;
  provider: string;
  costUsd: number;
}

async function requestEditorialTitle(input: {
  promptName: 'title' | 'title-compression';
  message: string;
  operation: 'generateEditorialTitle' | 'compressEditorialTitle';
  budget?: number;
}): Promise<EditorialTitleResult> {
  let model = 'unknown';
  let provider = 'unknown';
  let costUsd = 0;
  let reason = 'invalid_title';
  try {
    // Title intentionally uses LLM_MODEL: CTR-critical copy with short, low-cost input.
    const config = getOpenRouterConfig({ thinkingModel: null });
    model = config.model;
    const system = readFileSync(
      new URL(
        `../../prompts/${input.promptName}-system-prompt.txt`,
        import.meta.url,
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
                  ? input.message
                  : `${input.message}\n\n上一个标题不符合要求（${reason}）。请更正，只输出有效、完整的标题这一行。`,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        },
        null,
        input.operation,
        { reasoning: { enabled: false } },
      );
      const metadata = completionMetadata(completion, config.model, null);
      model = metadata.model;
      provider = metadata.provider;
      costUsd += metadata.costUsd;
      const choice = completion.choices[0]!;
      const normalized =
        choice.finish_reason === 'length'
          ? null
          : normalizeEditorialTitle(choice.message.content);
      if (normalized === null) {
        reason =
          choice.finish_reason === 'length' ? 'truncated' : 'invalid_title';
        continue;
      }
      const title =
        input.budget === undefined ? normalized : convertTextToZhCN(normalized);
      if (input.budget !== undefined && [...title].length > input.budget) {
        reason = `超过 ${input.budget} 字（${[...title].length}）`;
        continue;
      }
      return { title, model, provider, costUsd };
    }
  } catch (error) {
    reason = `transport: ${errorMessage(error)}`;
  }
  logIngestEvent(
    input.budget === undefined
      ? 'llm:title-fallback'
      : 'llm:title-compression-fallback',
    { reason, ...(input.budget === undefined ? {} : { budget: input.budget }) },
  );
  return { title: null, model, provider, costUsd };
}

export async function generateEditorialTitleWithLLM(
  sourceTitle: string,
): Promise<EditorialTitleResult> {
  return requestEditorialTitle({
    promptName: 'title',
    message: sourceTitle,
    operation: 'generateEditorialTitle',
  });
}

export async function compressEditorialTitleWithLLM(
  best: string,
  source: string,
  budget: number,
): Promise<
  Omit<EditorialTitleResult, 'title'> & {
    title: string;
    method: 'llm' | 'truncate';
  }
> {
  const result = await requestEditorialTitle({
    promptName: 'title-compression',
    message: `Best Title: ${best}\n来源标题: ${source}\n上限 N: ${budget} 个 Unicode 字符`,
    operation: 'compressEditorialTitle',
    budget,
  });
  return {
    ...result,
    title: result.title ?? fitTitleToBudget(convertTextToZhCN(best), budget),
    method: result.title === null ? 'truncate' : 'llm',
  };
}

export async function buildEditorialTitleVariants(
  best: string,
  source: string,
  budgets: readonly number[],
): Promise<{ titleVariants: TitleVariants; cost: UsageCostLine[] }> {
  const titleVariants: TitleVariants = {};
  const cost: UsageCostLine[] = [];
  for (const budget of new Set(budgets)) {
    if ([...best].length <= budget) continue;
    const result = await compressEditorialTitleWithLLM(best, source, budget);
    titleVariants[String(budget)] = {
      title: result.title,
      method: result.method,
    };
    cost.push(buildLlmCostLine('LLM title', result));
  }
  return { titleVariants, cost };
}
