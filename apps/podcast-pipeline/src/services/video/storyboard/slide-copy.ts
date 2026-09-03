import type OpenAI from 'openai';

import { createCompletionWithRetry, getOpenRouterConfig } from '../../llm.js';
import { throwIfAborted } from '../abort.js';
import { containsEntityPhrase, isEnglishOnly } from './english-text.js';

export interface ConceptCardCopy {
  kicker: string;
  headline: string;
  points: string[];
  source: 'llm' | 'deterministic';
  model: string | null;
  costUsd: number | null;
}

export interface ConceptCardCopyRequest {
  title: string;
  evidence: string;
  entities: readonly string[];
  intent: readonly string[];
  lead: boolean;
  signal?: AbortSignal;
}

interface ConceptCardCopyProvider {
  readonly model: string;
  complete(request: ConceptCardCopyRequest): Promise<{
    value: unknown;
    costUsd: number | null;
  }>;
}

const WORD_PATTERN = /[A-Za-z0-9][A-Za-z0-9+&.'’/-]*/gu;
const NUMBER_PATTERN = /(?<![A-Za-z])\d+(?:[.,]\d+)*(?:%|x|X)?(?![A-Za-z])/gu;

export async function writeConceptCardCopy(
  request: ConceptCardCopyRequest,
  options: { provider?: ConceptCardCopyProvider } = {},
): Promise<ConceptCardCopy> {
  throwIfAborted(request.signal);
  const provider = options.provider ?? createOpenRouterConceptCardCopyProvider();
  try {
    const result = await provider.complete(request);
    throwIfAborted(request.signal);
    const validated = validateConceptCardCopy(result.value, request);
    if (validated) {
      return {
        ...validated,
        source: 'llm',
        model: provider.model,
        costUsd: result.costUsd,
      };
    }
  } catch (error) {
    if (request.signal?.aborted) throw error;
  }
  return deterministicConceptCardCopy(request);
}

export function createOpenRouterConceptCardCopyProvider(): ConceptCardCopyProvider {
  const { openai, model } = getOpenRouterConfig({ thinkingModel: null });
  return {
    model,
    complete: (request) => completeConceptCardCopy(openai, model, request),
  };
}

async function completeConceptCardCopy(
  openai: OpenAI,
  model: string,
  request: ConceptCardCopyRequest,
): Promise<{ value: unknown; costUsd: number | null }> {
  const completion = await createCompletionWithRetry(
    openai,
    {
      model,
      messages: [
        { role: 'system', content: buildConceptCardSystemPrompt() },
        {
          role: 'user',
          content: JSON.stringify({
            title: request.title,
            sceneEvidence: request.evidence,
            entities: request.entities,
            searchIntent: request.intent,
            lead: request.lead,
          }),
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
      max_tokens: 400,
    },
    null,
    'writeConceptCard',
    {
      ...(request.signal ? { signal: request.signal } : {}),
      reasoning: { enabled: false },
    },
  );
  const content = completion.choices[0]?.message?.content ?? '';
  let value: unknown = null;
  try {
    value = JSON.parse(content);
  } catch {
    value = null;
  }
  return {
    value,
    costUsd:
      'costUsd' in completion && typeof completion.costUsd === 'number'
        ? completion.costUsd
        : null,
  };
}

export function buildConceptCardSystemPrompt(): string {
  return [
    'Write a compact English concept card for a vertical news video scene.',
    'Return JSON only: {"kicker":"CONCEPT","headline":"2 to 7 words","points":["short point","short point"]}.',
    '- English only. Do not copy or translate the full narration sentence.',
    '- Headline: 2 to 7 words and at most 42 characters.',
    '- Points: exactly 2 or 3, each at most 8 words and 48 characters.',
    '- Use only numbers and named entities grounded in sceneEvidence or entities.',
    '- No generic filler, slogans, calls to action, price predictions, or investment advice.',
    '- The card must communicate the scene concept, not act as subtitles.',
    '- For lead=true, the headline must name the principal subject when one is available.',
  ].join('\n');
}

export function validateConceptCardCopy(
  value: unknown,
  request: ConceptCardCopyRequest,
): Pick<ConceptCardCopy, 'kicker' | 'headline' | 'points'> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const kicker = typeof row['kicker'] === 'string' ? row['kicker'].trim() : '';
  const headline =
    typeof row['headline'] === 'string' ? row['headline'].trim() : '';
  const points = Array.isArray(row['points'])
    ? row['points'].flatMap((point) =>
        typeof point === 'string' && point.trim() ? [point.trim()] : [],
      )
    : [];
  if (!kicker || !isEnglishOnly(kicker) || kicker.length > 24) return null;
  if (!validLine(headline, 2, 7, 42)) return null;
  if (points.length < 2 || points.length > 3) return null;
  if (points.some((point) => !validLine(point, 1, 8, 48))) return null;
  const corpus = `${request.evidence} ${request.entities.join(' ')}`;
  const output = `${headline} ${points.join(' ')}`;
  if (!numbersAreGrounded(output, corpus)) return null;
  if (!entitiesAreGrounded(output, request)) return null;
  if (request.lead && request.entities.length > 0) {
    if (!request.entities.some((entity) => containsEntityPhrase(headline, entity))) {
      return null;
    }
  }
  return { kicker, headline, points };
}

export function deterministicConceptCardCopy(
  request: ConceptCardCopyRequest,
): ConceptCardCopy {
  const primary =
    request.entities.find((entity) => isEnglishOnly(entity)) ??
    request.intent.find((intent) => isEnglishOnly(intent)) ??
    request.title;
  const headline = compactWords(primary, 7, 42) || 'Key Point';
  const evidenceWords = words(request.evidence).filter(
    (word) => !words(headline).some((headlineWord) => headlineWord.toLowerCase() === word.toLowerCase()),
  );
  const firstPoint = compactWords(evidenceWords.slice(0, 7).join(' '), 7, 48);
  const secondPoint = compactWords(
    request.intent.find((intent) => isEnglishOnly(intent)) ?? request.title,
    7,
    48,
  );
  return {
    kicker: request.lead ? 'LEAD CONCEPT' : 'KEY CONCEPT',
    headline,
    points: [firstPoint || 'Context at a glance', secondPoint || 'Visual summary'].slice(0, 2),
    source: 'deterministic',
    model: null,
    costUsd: null,
  };
}

function validLine(
  value: string,
  minWords: number,
  maxWords: number,
  maxChars: number,
): boolean {
  if (!value || value.length > maxChars || !isEnglishOnly(value)) return false;
  const count = words(value).length;
  return count >= minWords && count <= maxWords;
}

function words(value: string): string[] {
  return value.match(WORD_PATTERN) ?? [];
}

function compactWords(value: string, maxWords: number, maxChars: number): string {
  const selected = words(value).slice(0, maxWords);
  while (selected.length > 0 && selected.join(' ').length > maxChars) selected.pop();
  return selected.join(' ');
}

function numbersAreGrounded(output: string, corpus: string): boolean {
  const grounded = new Set(corpus.match(NUMBER_PATTERN) ?? []);
  return (output.match(NUMBER_PATTERN) ?? []).every((number) => grounded.has(number));
}

function entitiesAreGrounded(
  output: string,
  request: ConceptCardCopyRequest,
): boolean {
  const capitalized = output.match(/\b[A-Z][A-Za-z0-9+.-]{2,}\b/gu) ?? [];
  const allowed = `${request.evidence} ${request.entities.join(' ')} ${request.intent.join(' ')} ${request.title}`;
  return capitalized.every((entity) => containsEntityPhrase(allowed, entity));
}
