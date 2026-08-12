import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  stripJsonFence,
} from '../services/llm.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const X_TEXT_MAX_WEIGHTED_LENGTH = 250;
const X_URL_WEIGHT = 23;
const URL_PATTERN = /https?:\/\/[^\s]+/giu;
const SINGLE_URL_PATTERN = /https?:\/\/[^\s]+/iu;

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

const XTextSchema = z
  .string()
  .trim()
  .min(1)
  .superRefine((text, context) => {
    if (SINGLE_URL_PATTERN.test(text)) {
      context.addIssue({
        code: 'custom',
        message:
          'X text must not contain a URL; the episode share URL is appended automatically.',
      });
    }

    const weightedLength = weightedTweetLength(text);
    if (weightedLength <= X_TEXT_MAX_WEIGHTED_LENGTH) return;

    context.addIssue({
      code: 'custom',
      message: `X text is ${weightedLength} weighted units; the maximum is ${X_TEXT_MAX_WEIGHTED_LENGTH}.`,
    });
  });

const GeneratedSocialCopySchema = z.object({
  hook: z.string().trim().min(1),
  x: z.object({
    text: XTextSchema,
  }),
  rednote: z.object({
    title: z.string().trim().min(1).max(20),
    body: z.string().trim().min(1),
    hashtags: z.array(z.string().trim().min(1)).min(3).max(5),
  }),
});

const SOCIAL_MODEL = 'openrouter/free';
const MAX_ATTEMPTS = 2;
const SOCIAL_PROMPT_ROOT = new URL('../../prompts/social/', import.meta.url);

export function parseGeneratedSocialCopy(raw: string): GeneratedSocialCopy {
  const parsed = GeneratedSocialCopySchema.parse(
    JSON.parse(stripJsonFence(raw.trim())),
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
}): Promise<{ copy: GeneratedSocialCopy; model: string }> {
  const [commonRules, xRules, rednoteRules] = await Promise.all([
    readPrompt('editorial.md'),
    readPrompt('x.md'),
    readPrompt('rednote.md'),
  ]);
  const config = getOpenRouterConfig({
    model: SOCIAL_MODEL,
    thinkingModel: null,
  });

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

      return { copy: parseGeneratedSocialCopy(content), model: config.model };
    } catch (error) {
      lastError = error;
      retryReason = describeValidationFailure(error);
    }
  }

  throw new Error('OpenRouter returned invalid social copy twice.', {
    cause: lastError,
  });
}

async function readPrompt(filename: string): Promise<string> {
  return readFile(new URL(filename, SOCIAL_PROMPT_ROOT), 'utf8');
}

function buildSystemPrompt(
  commonRules: string,
  xRules: string,
  rednoteRules: string,
): string {
  return `${commonRules}\n\n## X rules\n${xRules}\n\n## Rednote rules\n${rednoteRules}\n\nReturn JSON only with exactly this shape:\n{\n  "hook": "...",\n  "x": { "text": "..." },\n  "rednote": {\n    "title": "...",\n    "body": "...",\n    "hashtags": ["tag without #", "..."]\n  }\n}\n\nAll copy must be Traditional Chinese. X text must not contain a URL; the episode share URL is appended by the publisher. Rednote title must be at most 20 characters. Hashtags must contain 3 to 5 items without the # prefix.`;
}

function buildEpisodePrompt(
  episode: SocialEpisode,
  feedback: string | undefined,
  retryReason: string | undefined,
): string {
  const feedbackBlock = feedback?.trim()
    ? `\n\nEditor feedback for this regeneration:\n${feedback.trim()}`
    : '';
  const retryBlock = retryReason
    ? `\n\nThe previous response failed validation for this reason:\n${retryReason}\nReturn valid JSON only and correct that specific problem while satisfying every required field.`
    : '';

  return `Create social copy for this completed episode.\n\nTitle:\n${episode.title}\n\nSummary:\n${episode.summary}\n\nDescription / source article:\n${episode.description ?? ''}\n\nFull podcast transcript:\n${episode.transcript}\n\nEpisode URL:\n${episode.episodeUrl}${feedbackBlock}${retryBlock}`;
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
  if (error instanceof Error) return error.message;
  return String(error);
}
