import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { SOCIAL_BRAND_CTA } from '../brand/cta.js';
import { errorMessage } from '../lib/errorMessage.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  stripJsonFence,
} from '../services/llm.js';
import { convertTextToZhTW } from '../services/opencc.js';
import {
  describeSensitiveMatches,
  findSensitiveTerms,
} from './lexicon/index.js';
import type { SocialPlatform } from './platforms.js';
import {
  type GeneratedSocialCopy,
  SOCIAL_HOOK_TYPES,
  SOCIAL_TOPICS,
  type SocialEpisode,
} from './types.js';

const X_TOTAL_MAX_WEIGHTED_LENGTH = 280;
const X_URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const SINGLE_URL_PATTERN = /https?:\/\/[^\s]+/iu;
// Loose on purpose: ETH/DeFi/EIP-style terms are legitimate and inflate the
// ratio of a short title, so this only catches wholesale language drift.
const MAX_LATIN_LETTER_RATIO = 0.35;
const ACCENTED_LATIN_PATTERN = /[À-ɏ]/u;
const LATIN_LETTER_PATTERN = /[A-Za-z]/gu;

export function weightedTweetLength(value: string): number {
  let length = 0;
  let previousEnd = 0;

  for (const match of value.matchAll(URL_PATTERN)) {
    length += weightedCharacterLength(value.slice(previousEnd, match.index));
    length += X_URL_WEIGHT;
    previousEnd = match.index + match[0].length;
  }

  return length + weightedCharacterLength(value.slice(previousEnd));
}

function weightedCharacterLength(value: string): number {
  return Array.from(value).reduce(
    (length, character) => length + (isCjkCharacter(character) ? 2 : 1),
    0,
  );
}

function isCjkCharacter(character: string): boolean {
  const codePoint = character.codePointAt(0) ?? 0;
  return (
    (codePoint >= 0x1100 && codePoint <= 0x11ff) ||
    (codePoint >= 0x2e80 && codePoint <= 0x4dbf) ||
    (codePoint >= 0x4e00 && codePoint <= 0x9fff) ||
    (codePoint >= 0xa960 && codePoint <= 0xa97f) ||
    (codePoint >= 0xac00 && codePoint <= 0xd7ff) ||
    (codePoint >= 0xf900 && codePoint <= 0xfaff) ||
    (codePoint >= 0xfe30 && codePoint <= 0xfe4f) ||
    (codePoint >= 0xff00 && codePoint <= 0xffef) ||
    (codePoint >= 0x20000 && codePoint <= 0x323af)
  );
}

const X_TEXT_MAX_WEIGHTED_LENGTH =
  X_TOTAL_MAX_WEIGHTED_LENGTH - weightedTweetLength(`\n\n${SOCIAL_BRAND_CTA}`);

export function latinLetterRatio(value: string): number {
  const visible = value.replace(/\s/gu, '');
  if (visible.length === 0) return 0;
  return (visible.match(LATIN_LETTER_PATTERN)?.length ?? 0) / visible.length;
}

// A model can answer in Simplified Chinese, so every published field is
// normalized through OpenCC before it is measured or shown for review.
const TraditionalChineseLine = z
  .string()
  .trim()
  .min(1)
  .transform(convertTextToZhTW)
  .superRefine(addAccentedLatinIssue);

// OpenCC only rewrites Chinese, so a model that drifts into another language
// still needs rejecting.
function addAccentedLatinIssue(value: string, context: z.RefinementCtx): void {
  const accented = ACCENTED_LATIN_PATTERN.exec(value);
  if (!accented) return;

  context.addIssue({
    code: 'custom',
    message: `Copy must not contain accented Latin letters (found "${accented[0]}").`,
  });
}

const XTextSchema = TraditionalChineseLine.superRefine((text, context) => {
  if (SINGLE_URL_PATTERN.test(text)) {
    context.addIssue({
      code: 'custom',
      message:
        'X text must not contain a URL; the fixed Zap Pilot CTA is appended automatically.',
    });
  }

  const weightedLength = weightedTweetLength(text);
  if (weightedLength <= X_TEXT_MAX_WEIGHTED_LENGTH) return;

  context.addIssue({
    code: 'custom',
    message: `X text is ${weightedLength} weighted units; the maximum is ${X_TEXT_MAX_WEIGHTED_LENGTH}. The fixed CTA must still fit X's ${X_TOTAL_MAX_WEIGHTED_LENGTH}-unit limit.`,
  });
});

const REDNOTE_TITLE_MAX_CHARACTERS = 20;
const RednoteBodySchema = TraditionalChineseLine.superRefine(
  (body, context) => {
    if (!SINGLE_URL_PATTERN.test(body)) return;
    context.addIssue({
      code: 'custom',
      message: 'Rednote body must not contain a URL or website CTA.',
    });
  },
);

const GeneratedSocialCopySchema = z
  .object({
    topic: z.enum(SOCIAL_TOPICS),
    hookType: z.enum(SOCIAL_HOOK_TYPES),
    x: z.object({ text: XTextSchema }),
    rednote: z.object({
      title: TraditionalChineseLine.superRefine((title, context) => {
        const length = Array.from(title).length;
        if (length <= REDNOTE_TITLE_MAX_CHARACTERS) return;

        context.addIssue({
          code: 'custom',
          message: `Rednote title is ${length} characters; the maximum is ${REDNOTE_TITLE_MAX_CHARACTERS}.`,
        });
      }),
      body: RednoteBodySchema,
      hashtags: z.array(TraditionalChineseLine).min(3).max(5),
    }),
  })
  .superRefine(addRednoteSensitiveTermIssues)
  .superRefine((copy, context) => {
    const combined = [
      copy.x.text,
      copy.rednote.title,
      copy.rednote.body,
      ...copy.rednote.hashtags,
    ].join('\n');
    const ratio = latinLetterRatio(combined);
    if (ratio <= MAX_LATIN_LETTER_RATIO) return;

    context.addIssue({
      code: 'custom',
      message: `Copy is ${Math.round(ratio * 100)}% Latin letters; the maximum is ${Math.round(MAX_LATIN_LETTER_RATIO * 100)}%.`,
    });
  });

// Rednote is the only platform that deletes a rejected post silently, so its
// moderation gate runs here, where a failed field still routes through
// `describeValidationFailure` into a regeneration attempt. Issues are reported
// per field so the model is told which one to restate.
function addRednoteSensitiveTermIssues(
  copy: { rednote: { title: string; body: string; hashtags: string[] } },
  context: z.RefinementCtx,
): void {
  const fields: { path: (string | number)[]; value: string }[] = [
    { path: ['rednote', 'title'], value: copy.rednote.title },
    { path: ['rednote', 'body'], value: copy.rednote.body },
    ...copy.rednote.hashtags.map((tag, index) => ({
      path: ['rednote', 'hashtags', index],
      value: tag,
    })),
  ];

  for (const { path, value } of fields) {
    const matches = findSensitiveTerms(value);
    if (matches.length === 0) continue;
    context.addIssue({
      code: 'custom',
      path,
      message: describeSensitiveMatches(matches),
    });
  }
}

// Three, not two: a provider that answers with a nested or truncated payload is
// common enough that two attempts left the CLI failing outright.
const MAX_ATTEMPTS = 3;
const SOCIAL_PROMPT_ROOT = new URL('../../prompts/social/', import.meta.url);

// Providers behind the same model id disagree about json_object mode: some
// answer with the requested object, others nest it as a fenced string under an
// arbitrary key (observed: {"stable diff":"ok","text":"```json…"}).
function unwrapNestedPayload(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const record = value as Record<string, unknown>;
  if ('x' in record || 'rednote' in record) return value;

  for (const nested of Object.values(record)) {
    if (typeof nested !== 'string') continue;
    try {
      return JSON.parse(stripJsonFence(nested.trim()));
    } catch {
      continue;
    }
  }
  return value;
}

export function parseGeneratedSocialCopy(raw: string): GeneratedSocialCopy {
  const parsed = GeneratedSocialCopySchema.parse(
    unwrapNestedPayload(JSON.parse(stripJsonFence(raw.trim()))),
  );
  return {
    ...parsed,
    rednote: {
      ...parsed.rednote,
      hashtags: parsed.rednote.hashtags.map((tag) => tag.replace(/^#+/, '')),
    },
  };
}

export async function generateSocialCopy(input: {
  episode: SocialEpisode;
  feedback?: string;
  strategyGuidance?: string;
  strategyGuidanceByPlatform?: Partial<Record<SocialPlatform, string>>;
}): Promise<{ copy: GeneratedSocialCopy; model: string }> {
  const [commonRules, xRules, rednoteRules] = await Promise.all([
    readPrompt('editorial.md'),
    readPrompt('x.md'),
    readPrompt('rednote.md'),
  ]);
  // Social copy is published verbatim, so it runs on the pipeline's configured
  // LLM_MODEL rather than a free router that silently swaps models per request.
  const config = getOpenRouterConfig({ thinkingModel: null });

  let lastError: unknown;
  let retryReason: string | undefined;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await createOpenRouterChatCompletion(
        config.openai,
        {
          model: config.model,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(commonRules, xRules, rednoteRules),
            },
            {
              role: 'user',
              content: buildEpisodePrompt(
                input.episode,
                input.feedback,
                retryReason,
                input.strategyGuidance,
                input.strategyGuidanceByPlatform,
              ),
            },
          ],
        },
        config.thinkingModel,
      );
      const content = completion.choices[0]?.message.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('OpenRouter returned empty social copy.');
      }

      return {
        copy: parseGeneratedSocialCopy(content),
        model: completion.model ?? config.model,
      };
    } catch (error) {
      lastError = error;
      retryReason = describeValidationFailure(error);
    }
  }

  throw new Error(
    `OpenRouter returned invalid social copy ${MAX_ATTEMPTS} times. Last failure: ${retryReason ?? 'unknown'}`,
    { cause: lastError },
  );
}

async function readPrompt(filename: string): Promise<string> {
  return readFile(new URL(filename, SOCIAL_PROMPT_ROOT), 'utf8');
}

function buildSystemPrompt(
  commonRules: string,
  xRules: string,
  rednoteRules: string,
): string {
  return `${commonRules}\n\nThe X and Rednote outputs must express the same underlying episode thesis and hook, while adapting wording to each platform. Apply platform-specific restrictions only to their corresponding output fields; Rednote-only compliance rules must not sanitize or rewrite x.text.\n\n## X rules (x.text only)\n${xRules}\n\n## Rednote rules (rednote fields only)\n${rednoteRules}\n\nReturn JSON only with exactly this shape:\n{\n  "topic": "one allowed topic",\n  "hookType": "one allowed hook type",\n  "x": { "text": "..." },\n  "rednote": {\n    "title": "...",\n    "body": "...",\n    "hashtags": ["tag without #", "..."]\n  }\n}\n\nAllowed topic values: ${SOCIAL_TOPICS.join(', ')}.\nAllowed hookType values: ${SOCIAL_HOOK_TYPES.join(', ')}.\n\nAll copy must be Traditional Chinese. X text must not contain a URL or closing CTA; the publisher may append a platform-specific CTA. Rednote title must be at most 20 characters. Rednote body must not contain a URL or website CTA. Hashtags must contain 3 to 5 items without the # prefix.`;
}

function buildEpisodePrompt(
  episode: SocialEpisode,
  feedback: string | undefined,
  retryReason: string | undefined,
  strategyGuidance: string | undefined,
  strategyGuidanceByPlatform:
    | Partial<Record<SocialPlatform, string>>
    | undefined,
): string {
  const feedbackBlock = feedback?.trim()
    ? `\n\nEditor feedback for this regeneration:\n${feedback.trim()}`
    : '';
  const retryBlock = retryReason
    ? `\n\nThe previous response failed validation for this reason:\n${retryReason}\nReturn valid JSON only and correct that specific problem while satisfying every required field.`
    : '';
  const strategyBlock = strategyGuidance?.trim()
    ? `\n\nPerformance guidance from prior posts:\n${strategyGuidance.trim()}\nTreat this as a preference, never as permission to violate the editorial or platform rules.`
    : '';
  const platformStrategyBlocks = Object.entries(
    strategyGuidanceByPlatform ?? {},
  )
    .filter((entry): entry is [SocialPlatform, string] =>
      Boolean(entry[1]?.trim()),
    )
    .map(([platform, guidance]) => `\n### ${platform}\n${guidance.trim()}`)
    .join('');
  const platformStrategyBlock = platformStrategyBlocks
    ? `\n\nPerformance guidance by platform:${platformStrategyBlocks}\nTreat each section only as a preference for that platform, never as permission to violate editorial or platform rules.`
    : '';

  return `Create social copy for this completed episode.\n\nTitle:\n${episode.title}\n\nSummary:\n${episode.summary}\n\nDescription / source article:\n${episode.description ?? ''}\n\nFull podcast transcript:\n${episode.transcript}\n\nEpisode URL:\n${episode.episodeUrl}${strategyBlock}${platformStrategyBlock}${feedbackBlock}${retryBlock}`;
}

function describeValidationFailure(error: unknown): string {
  if (error instanceof z.ZodError) {
    return error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : 'response';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
  }
  if (error instanceof SyntaxError) {
    return `Invalid JSON: ${error.message}`;
  }
  return errorMessage(error);
}
