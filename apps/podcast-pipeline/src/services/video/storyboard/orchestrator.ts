import { throwIfAborted } from '../abort.js';
import type { StoryboardDraft } from './draft.js';
import { createDeterministicStoryboard } from './fallback.js';
import type { StoryboardProvider, StoryboardTokenUsage } from './provider.js';
import { splitCanonicalSentences } from './sentences.js';
import {
  type StoryboardValidationIssue,
  validateStoryboardDraft,
} from './validation.js';

export interface StoryboardAttemptReport {
  attempt: number;
  valid: boolean;
  issues: StoryboardValidationIssue[];
  error: string | null;
  usage: StoryboardTokenUsage | null;
}

export interface StoryboardGenerationResult {
  draft: StoryboardDraft;
  effectiveProvider: string;
  requestedProvider: string;
  model: string | null;
  usedFallback: boolean;
  attempts: StoryboardAttemptReport[];
  totalUsage: StoryboardTokenUsage;
}

function usageTotal(
  attempts: readonly StoryboardAttemptReport[],
): StoryboardTokenUsage {
  return attempts.reduce<StoryboardTokenUsage>(
    (total, attempt) => ({
      inputTokens: total.inputTokens + (attempt.usage?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (attempt.usage?.outputTokens ?? 0),
      totalTokens: total.totalTokens + (attempt.usage?.totalTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
}

function providerErrorIssue(error: unknown): StoryboardValidationIssue {
  return {
    code: 'provider.response',
    path: [],
    message: error instanceof Error ? error.message : String(error),
  };
}

export async function generateStoryboard(input: {
  title: string;
  script: string;
  durationMs: number;
  provider: StoryboardProvider;
  signal?: AbortSignal;
}): Promise<StoryboardGenerationResult> {
  const sentences = splitCanonicalSentences(input.script);
  if (sentences.length === 0) {
    throw new Error('Canonical script does not contain any sentences');
  }

  const attempts: StoryboardAttemptReport[] = [];
  let repairIssues: StoryboardValidationIssue[] | undefined;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    throwIfAborted(input.signal);
    try {
      const generated = await input.provider.generate(
        {
          title: input.title,
          script: input.script,
          durationMs: input.durationMs,
          sentences,
        },
        {
          ...(input.signal ? { signal: input.signal } : {}),
          ...(repairIssues ? { repairIssues } : {}),
        },
      );
      const validation = validateStoryboardDraft(generated.draft, {
        script: input.script,
        sentences,
        durationMs: input.durationMs,
      });
      attempts.push({
        attempt,
        valid: validation.success,
        issues: validation.issues,
        error: null,
        usage: generated.usage,
      });
      if (validation.success) {
        return {
          draft: validation.draft,
          effectiveProvider: input.provider.name,
          requestedProvider: input.provider.name,
          model: generated.model,
          usedFallback: false,
          attempts,
          totalUsage: usageTotal(attempts),
        };
      }
      repairIssues = validation.issues;
    } catch (error) {
      if (input.signal?.aborted) throw error;
      const issue = providerErrorIssue(error);
      attempts.push({
        attempt,
        valid: false,
        issues: [issue],
        error: issue.message,
        usage: null,
      });
      repairIssues = [issue];
    }
  }

  const fallback = createDeterministicStoryboard({
    title: input.title,
    script: input.script,
    durationMs: input.durationMs,
    sentences,
  });
  const fallbackValidation = validateStoryboardDraft(fallback, {
    script: input.script,
    sentences,
    durationMs: input.durationMs,
  });
  if (!fallbackValidation.success) {
    throw new Error(
      `Deterministic storyboard failed validation: ${fallbackValidation.issues
        .map((issue) => issue.message)
        .join('; ')}`,
    );
  }

  return {
    draft: fallbackValidation.draft,
    effectiveProvider: 'deterministic',
    requestedProvider: input.provider.name,
    model: null,
    usedFallback: true,
    attempts,
    totalUsage: usageTotal(attempts),
  };
}
