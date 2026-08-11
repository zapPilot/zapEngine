import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { getOpenRouterConfig } from '../services/llm.js';
import type { GeneratedSocialCopy, SocialEpisode } from './types.js';

const GeneratedSocialCopySchema = z.object({
  hook: z.string().trim().min(1),
  x: z.object({
    text: z.string().trim().min(1),
  }),
  rednote: z.object({
    title: z.string().trim().min(1).max(20),
    body: z.string().trim().min(1),
    hashtags: z.array(z.string().trim().min(1)).min(3).max(5),
  }),
});

const SOCIAL_MODEL = 'openrouter/free';
const MAX_ATTEMPTS = 2;
const REPO_ROOT = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
);
const SKILL_ROOT = resolve(REPO_ROOT, '.agent', 'skills', 'social-publish');

export function parseGeneratedSocialCopy(raw: string): GeneratedSocialCopy {
  const parsed = GeneratedSocialCopySchema.parse(JSON.parse(raw));
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
    readSkill('SKILL.md'),
    readSkill('x.md'),
    readSkill('rednote.md'),
  ]);
  const config = getOpenRouterConfig({
    model: process.env['SOCIAL_OPENROUTER_MODEL']?.trim() || SOCIAL_MODEL,
    thinkingModel: null,
  });

  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const completion = await config.openai.chat.completions.create({
        model: config.model,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: buildSystemPrompt(commonRules, xRules, rednoteRules),
          },
          {
            role: 'user',
            content: buildEpisodePrompt(input.episode, input.feedback, attempt),
          },
        ],
      });
      const content = completion.choices[0]?.message.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('OpenRouter returned empty social copy.');
      }

      return { copy: parseGeneratedSocialCopy(content), model: config.model };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error('OpenRouter returned invalid social copy twice.', {
    cause: lastError,
  });
}

async function readSkill(filename: string): Promise<string> {
  return readFile(resolve(SKILL_ROOT, filename), 'utf8');
}

function buildSystemPrompt(
  commonRules: string,
  xRules: string,
  rednoteRules: string,
): string {
  return `${commonRules}\n\n## X rules\n${xRules}\n\n## Rednote rules\n${rednoteRules}\n\nReturn JSON only with exactly this shape:\n{\n  "hook": "...",\n  "x": { "text": "..." },\n  "rednote": {\n    "title": "...",\n    "body": "...",\n    "hashtags": ["tag without #", "..."]\n  }\n}\n\nAll copy must be Traditional Chinese. Rednote title must be at most 20 characters. Hashtags must contain 3 to 5 items without the # prefix.`;
}

function buildEpisodePrompt(
  episode: SocialEpisode,
  feedback: string | undefined,
  attempt: number,
): string {
  const feedbackBlock = feedback?.trim()
    ? `\n\nEditor feedback for this regeneration:\n${feedback.trim()}`
    : '';
  const retryBlock =
    attempt === 2
      ? '\n\nThe previous response failed JSON/schema validation. Return valid JSON only and satisfy every required field.'
      : '';

  return `Create social copy for this completed episode.\n\nTitle:\n${episode.title}\n\nSummary:\n${episode.summary}\n\nDescription / source article:\n${episode.description ?? ''}\n\nFull podcast transcript:\n${episode.transcript}\n\nEpisode URL:\n${episode.episodeUrl}${feedbackBlock}${retryBlock}`;
}
