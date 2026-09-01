import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { errorMessage } from '../lib/errorMessage.js';
import { getOpenRouterModelCandidates } from '../services/llm-model-fallback.js';
import {
  createOpenRouterChatCompletion,
  getOpenRouterConfig,
  stripJsonFence,
  unwrapNestedJsonPayload,
} from '../services/llm.js';
import type { SocialEpisode } from './types.js';

/**
 * The semantic half of the Rednote gate. `./lexicon/` catches wording that can
 * only be an instruction; these four rules are about framing, which no term list
 * can express — an allocation stated as a quote, a political motive presented as
 * market causation, a prediction asserted more strongly than its source.
 *
 * The rule text lives in `prompts/social/rednote-risk-rules.md` and is the same
 * file the copy generator gives the writer, so the judge and the writer cannot
 * drift apart about what is forbidden.
 *
 * These ids are a stable vocabulary on purpose: the next step for this gate is
 * learning rejection rate per risk feature, and that needs ids that survive a
 * prompt rewrite.
 */
export const REDNOTE_RISK_RULES = [
  'asset_allocation_advice',
  'market_timing_advice',
  'political_market_speculation',
  'strong_prediction_unattributed',
] as const;

export type RednoteRiskRule = (typeof REDNOTE_RISK_RULES)[number];

export class RednoteSemanticRiskError extends Error {
  readonly rules: readonly RednoteRiskRule[];
  /**
   * `risk` is a verdict against the copy; `unavailable` means the judge could
   * not reach a verdict at all. Both stop the publish -- a gate that fails open
   * is the failure this whole module exists to prevent -- but the operator needs
   * to tell "the copy was wrong" apart from "the gate is down".
   */
  readonly reason: 'risk' | 'unavailable';

  constructor(input: {
    message: string;
    reason: 'risk' | 'unavailable';
    rules?: readonly RednoteRiskRule[];
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = 'RednoteSemanticRiskError';
    this.reason = input.reason;
    this.rules = input.rules ?? [];
  }
}

// `rule` stays a free string rather than an enum: a model that invents an id has
// still flagged something, and turning that into a schema failure would report
// the gate as down when it actually answered.
const JudgementSchema = z.object({
  risks: z
    .array(
      z.object({
        rule: z.string().trim().min(1),
        evidence: z.string().trim().min(1),
        reason: z.string().trim().min(1),
      }),
    )
    .max(20),
});

const RISK_RULES_PROMPT = new URL(
  '../../prompts/social/rednote-risk-rules.md',
  import.meta.url,
);

const JUDGE_MAX_TOKENS = 800;

export async function readRednoteRiskRules(): Promise<string> {
  return readFile(RISK_RULES_PROMPT, 'utf8');
}

/**
 * Judges one generated Rednote note. Throws on a verdict of risk and on being
 * unable to reach a verdict; returns quietly only when a model answered and
 * found nothing. Output-contract failures fail over to the ordered model list
 * before the gate is considered unavailable.
 */
export async function assertRednoteSemanticRisk(input: {
  rednote: { title: string; body: string; hashtags: readonly string[] };
  /** R4 compares the copy against what the episode actually claims. */
  episode: Pick<SocialEpisode, 'title' | 'summary' | 'transcript'>;
}): Promise<void> {
  const rules = await readRednoteRiskRules();
  const primaryConfig = getOpenRouterConfig({ thinkingModel: null });
  const models = getOpenRouterModelCandidates(primaryConfig.model);
  let lastUnavailableDetail = 'the judge returned no verdict';
  let lastUnavailableCause: unknown;

  for (const model of models) {
    const config =
      model === primaryConfig.model
        ? primaryConfig
        : getOpenRouterConfig({ model, thinkingModel: null });

    let content: string | null | undefined;
    try {
      const completion = await createOpenRouterChatCompletion(
        config.openai,
        {
          model: config.model,
          response_format: { type: 'json_object' },
          max_tokens: JUDGE_MAX_TOKENS,
          messages: [
            { role: 'system', content: buildJudgeSystemPrompt(rules) },
            { role: 'user', content: buildJudgeUserPrompt(input) },
          ],
        },
        config.thinkingModel,
        {
          reasoning: { enabled: false },
          logContext: { prefix: '[rednote-risk]' },
        },
      );
      content = completion.choices[0]?.message.content;
    } catch (error) {
      lastUnavailableDetail = `model ${model} request failed`;
      lastUnavailableCause = error;
      continue;
    }

    if (typeof content !== 'string' || !content.trim()) {
      lastUnavailableDetail = `model ${model} returned an empty response`;
      lastUnavailableCause = undefined;
      continue;
    }

    let judgement: z.infer<typeof JudgementSchema>;
    try {
      judgement = JudgementSchema.parse(
        unwrapNestedJsonPayload(JSON.parse(stripJsonFence(content.trim())), [
          'risks',
        ]),
      );
    } catch (error) {
      lastUnavailableDetail = `model ${model} returned an unreadable verdict`;
      lastUnavailableCause = error;
      continue;
    }

    if (judgement.risks.length === 0) return;

    const detail = judgement.risks
      .map((risk) => `${risk.rule} — "${risk.evidence}" (${risk.reason})`)
      .join('; ');
    throw new RednoteSemanticRiskError({
      reason: 'risk',
      rules: judgement.risks
        .map((risk) => risk.rule)
        .filter(isRednoteRiskRule)
        // One rule reported twice adds nothing to the rewrite instruction.
        .filter((rule, index, all) => all.indexOf(rule) === index),
      message: `Rednote copy breaks investment-direction red lines (${detail}). Rewrite the copy so it reports the same finding without giving direction or asserting an unattributed claim; do not drop or soften the episode's subject to satisfy this.`,
    });
  }

  throw unavailable(
    `${lastUnavailableDetail} after trying ${models.length} model${models.length === 1 ? '' : 's'}`,
    lastUnavailableCause,
  );
}

function isRednoteRiskRule(value: string): value is RednoteRiskRule {
  return (REDNOTE_RISK_RULES as readonly string[]).includes(value);
}

function unavailable(
  detail: string,
  cause?: unknown,
): RednoteSemanticRiskError {
  const suffix = cause === undefined ? '' : `: ${errorMessage(cause)}`;
  return new RednoteSemanticRiskError({
    reason: 'unavailable',
    message: `Rednote semantic risk gate could not reach a verdict — ${detail}${suffix}. The copy is not published ungated.`,
    ...(cause === undefined ? {} : { cause }),
  });
}

function buildJudgeSystemPrompt(rules: string): string {
  return `You review one Simplified/Traditional Chinese Rednote note before it is published, against the rules below. You are a reviewer, not an editor: report violations, never rewrite.

${rules}

Report a rule only when the note itself breaks it. Judge the note, not the episode: an episode may discuss allocation or timing while the note reports it without giving direction. Do not report a rule because of the subject matter, and do not invent a rule id.

For R4, compare the note against the supplied episode: a prediction the episode does contain, stated with the same strength and attributed to whoever made it, is not a violation.

Return JSON only with exactly this shape:
{
  "risks": [
    { "rule": "one rule id", "evidence": "the exact phrase from the note", "reason": "one short sentence" }
  ]
}

Return {"risks": []} when the note breaks none of them.`;
}

function buildJudgeUserPrompt(input: {
  rednote: { title: string; body: string; hashtags: readonly string[] };
  episode: Pick<SocialEpisode, 'title' | 'summary' | 'transcript'>;
}): string {
  const hashtags = input.rednote.hashtags.map((tag) => `#${tag}`).join(' ');
  return `Note title:\n${input.rednote.title}\n\nNote body:\n${input.rednote.body}\n\nNote hashtags:\n${hashtags}\n\n---\nEpisode title:\n${input.episode.title}\n\nEpisode summary:\n${input.episode.summary}\n\nEpisode transcript:\n${input.episode.transcript}`;
}
