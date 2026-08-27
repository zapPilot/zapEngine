import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { SOCIAL_BRAND_CTA_BY_LANGUAGE } from '../brand/cta.js';
import { errorMessage } from '../lib/errorMessage.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  stripJsonFence,
  unwrapNestedJsonPayload,
} from '../services/llm.js';
import { convertTextToZhTW } from '../services/opencc.js';
import {
  describeSensitiveMatches,
  findSensitiveTerms,
} from './lexicon/index.js';
import type { SocialPlatform } from './platforms.js';
import {
  assertRednoteSemanticRisk,
  readRednoteRiskRules,
} from './rednote-semantic-risk.js';
import {
  type GeneratedSocialCopy,
  SOCIAL_HOOK_TYPES,
  SOCIAL_TOPICS,
  type SocialEpisode,
  type SocialLanguageCode,
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

function xTextMaxWeightedLength(languageCode: SocialLanguageCode): number {
  return (
    X_TOTAL_MAX_WEIGHTED_LENGTH -
    weightedTweetLength(`\n\n${SOCIAL_BRAND_CTA_BY_LANGUAGE[languageCode]}`)
  );
}

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

function xTextSchema(languageCode: SocialLanguageCode): z.ZodType<string> {
  return languageLine(languageCode).superRefine((text, context) => {
    if (SINGLE_URL_PATTERN.test(text)) {
      context.addIssue({
        code: 'custom',
        message:
          'X text must not contain a URL; the fixed Zap Pilot CTA is appended automatically.',
      });
    }

    const weightedLength = weightedTweetLength(text);
    const maximum = xTextMaxWeightedLength(languageCode);
    if (weightedLength <= maximum) return;

    context.addIssue({
      code: 'custom',
      message: `X text is ${weightedLength} weighted units; the maximum is ${maximum}. The fixed CTA must still fit X's ${X_TOTAL_MAX_WEIGHTED_LENGTH}-unit limit.`,
    });
  });
}

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

export interface SocialCopyBlocks {
  short: boolean;
  rednote: boolean;
}

const ALL_COPY_BLOCKS: SocialCopyBlocks = { short: true, rednote: true };

function generatedSocialCopySchema(
  languageCode: SocialLanguageCode,
  blocks: SocialCopyBlocks,
) {
  const line = languageLine(languageCode);
  const short = z.object({ text: xTextSchema(languageCode) });
  const rednote = z.object({
    title: line.superRefine((title, context) => {
      const length = Array.from(title).length;
      if (length <= REDNOTE_TITLE_MAX_CHARACTERS) return;

      context.addIssue({
        code: 'custom',
        message: `Rednote title is ${length} characters; the maximum is ${REDNOTE_TITLE_MAX_CHARACTERS}.`,
      });
    }),
    body:
      languageCode === 'zh-Hant'
        ? RednoteBodySchema
        : line.superRefine(addNoUrlIssue),
    hashtags: z.array(line).min(3).max(5),
  });
  return z
    .object({
      topic: z.enum(SOCIAL_TOPICS),
      hookType: z.enum(SOCIAL_HOOK_TYPES),
      short: blocks.short ? short : z.never().optional(),
      rednote: blocks.rednote ? rednote : z.never().optional(),
    })
    .strict()
    .superRefine((copy, context) => {
      if (languageCode === 'zh-Hant' && copy.rednote) {
        addRednoteSensitiveTermIssues(
          copy as { rednote: NonNullable<GeneratedSocialCopy['rednote']> },
          context,
        );
      }
    })
    .superRefine((copy, context) => {
      const combined = [
        copy.short?.text,
        copy.rednote?.title,
        copy.rednote?.body,
        ...(copy.rednote?.hashtags ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .join('\n');
      if (!combined) return;
      const ratio = latinLetterRatio(combined);
      if (
        (languageCode !== 'en' && ratio <= MAX_LATIN_LETTER_RATIO) ||
        (languageCode === 'en' && ratio >= 0.5)
      )
        return;

      context.addIssue({
        code: 'custom',
        message:
          languageCode === 'en'
            ? `English copy is only ${Math.round(ratio * 100)}% Latin letters; the minimum is 50%.`
            : `Copy is ${Math.round(ratio * 100)}% Latin letters; the maximum is ${Math.round(MAX_LATIN_LETTER_RATIO * 100)}%.`,
      });
    });
}

const KANA_PATTERN = /[\u3040-\u30ff]/u;
const CJK_PATTERN = /[\u3040-\u30ff\u3400-\u9fff]/u;

function languageLine(languageCode: SocialLanguageCode): z.ZodType<string> {
  if (languageCode === 'zh-Hant') return TraditionalChineseLine;
  return z
    .string()
    .trim()
    .min(1)
    .superRefine((value, context) => {
      if (languageCode === 'ja' && !KANA_PATTERN.test(value)) {
        context.addIssue({
          code: 'custom',
          message: 'Japanese copy must contain kana.',
        });
      }
      if (languageCode === 'en' && CJK_PATTERN.test(value)) {
        context.addIssue({
          code: 'custom',
          message: 'English copy must not contain CJK characters.',
        });
      }
    });
}

function addNoUrlIssue(value: string, context: z.RefinementCtx): void {
  if (!SINGLE_URL_PATTERN.test(value)) return;
  context.addIssue({
    code: 'custom',
    message: 'Body must not contain a URL or website CTA.',
  });
}

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

export function parseGeneratedSocialCopy(
  raw: string,
  languageCode: SocialLanguageCode = 'zh-Hant',
  blocks: SocialCopyBlocks = ALL_COPY_BLOCKS,
): GeneratedSocialCopy {
  const parsed = generatedSocialCopySchema(languageCode, blocks).parse(
    unwrapNestedJsonPayload(JSON.parse(stripJsonFence(raw.trim())), [
      'short',
      'rednote',
    ]),
  );
  return {
    ...parsed,
    ...(parsed.rednote
      ? {
          rednote: {
            ...parsed.rednote,
            hashtags: parsed.rednote.hashtags.map((tag) =>
              tag.replace(/^#+/, ''),
            ),
          },
        }
      : {}),
  };
}

export async function generateSocialCopy(input: {
  episode: SocialEpisode;
  languageCode?: SocialLanguageCode;
  platforms?: readonly SocialPlatform[];
  feedback?: string;
  strategyGuidance?: string;
  strategyGuidanceByPlatform?: Partial<Record<SocialPlatform, string>>;
}): Promise<{ copy: GeneratedSocialCopy; model: string }> {
  const languageCode =
    input.languageCode ?? input.episode.languageCode ?? 'zh-Hant';
  const blocks = copyBlocksForPlatforms(input.platforms ?? ['x', 'rednote']);
  // The red-line rules are one file shared with the judge in
  // ./rednote-semantic-risk.ts, so the writer is held to exactly what the
  // gate checks.
  const [
    commonRules,
    shortRules,
    rednoteRules,
    rednoteRiskRules,
    languageRules,
  ] = await Promise.all([
    readPrompt('editorial.md'),
    blocks.short ? readPrompt('x.md') : Promise.resolve(''),
    blocks.rednote ? readPrompt('rednote.md') : Promise.resolve(''),
    blocks.rednote ? readRednoteRiskRules() : Promise.resolve(''),
    readPrompt(`language/${languageCode}.md`),
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
              content: buildSystemPrompt(
                commonRules,
                shortRules,
                `${rednoteRules}\n\n${rednoteRiskRules}`,
                languageRules,
                languageCode,
                blocks,
              ),
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
        {
          logContext: {
            prefix: '[social-copy]',
            details: { language: languageCode },
          },
        },
      );
      const content = completion.choices[0]?.message.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('OpenRouter returned empty social copy.');
      }

      const copy = parseGeneratedSocialCopy(content, languageCode, blocks);
      // The term lists ran inside the schema above. This is the framing half of
      // the gate, and it has to be here rather than in the schema because it is
      // an LLM call: a verdict of risk becomes the next attempt's retry reason,
      // so the model rewrites the note instead of the release failing.
      if (languageCode === 'zh-Hant' && copy.rednote) {
        await assertRednoteSemanticRisk({
          rednote: copy.rednote,
          episode: input.episode,
        });
      }

      return { copy, model: completion.model ?? config.model };
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
  shortRules: string,
  rednoteRules: string,
  languageRules: string,
  languageCode: SocialLanguageCode,
  blocks: SocialCopyBlocks,
): string {
  const blockRules = [
    blocks.short ? `## Short-form rules (short.text only)\n${shortRules}` : '',
    blocks.rednote
      ? `## Rednote rules (rednote fields only)\n${rednoteRules}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');
  const shape = [
    '  "topic": "one allowed topic",',
    '  "hookType": "one allowed hook type"',
    ...(blocks.short ? [',  "short": { "text": "..." }'] : []),
    ...(blocks.rednote
      ? [
          ',  "rednote": {',
          '    "title": "...",',
          '    "body": "...",',
          '    "hashtags": ["tag without #", "..."]',
          '  }',
        ]
      : []),
  ].join('\n');
  const restrictions = [
    blocks.short
      ? 'Short text must not contain a URL or closing CTA; the publisher appends the platform CTA.'
      : '',
    blocks.rednote
      ? 'Rednote title must be at most 20 characters. Rednote body must not contain a URL or website CTA. Hashtags must contain 3 to 5 items without the # prefix.'
      : '',
  ]
    .filter(Boolean)
    .join(' ');
  return `${commonRules}\n\n## Output language (${languageCode})\n${languageRules}\n\nEvery requested output must express the same underlying episode thesis and hook. Apply platform-specific restrictions only to their corresponding fields.\n\n${blockRules}\n\nReturn JSON only with exactly this shape:\n{\n${shape}\n}\n\nAllowed topic values: ${SOCIAL_TOPICS.join(', ')}.\nAllowed hookType values: ${SOCIAL_HOOK_TYPES.join(', ')}.\n\n${restrictions}`;
}

function copyBlocksForPlatforms(
  platforms: readonly SocialPlatform[],
): SocialCopyBlocks {
  return {
    short: platforms.some(
      (platform) => platform === 'x' || platform === 'threads',
    ),
    rednote: platforms.includes('rednote'),
  };
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
