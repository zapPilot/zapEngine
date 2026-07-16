import OpenAI from 'openai';

import type {
  StoryboardProvider,
  StoryboardProviderOptions,
  StoryboardProviderRequest,
  StoryboardProviderResult,
} from './provider.js';
import { formatSentencesForPrompt } from './sentences.js';

const DEFAULT_NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL = 'nvidia/nvidia-nemotron-nano-9b-v2';
const NVIDIA_TIMEOUT_MS = 45_000;
const NVIDIA_MAX_OUTPUT_TOKENS = 2_000;

function requiredApiKey(): string {
  const apiKey = process.env['NVIDIA_API_KEY']?.trim();
  if (!apiKey) throw new Error('NVIDIA_API_KEY not set');
  return apiKey;
}

function stripJsonFence(value: string): string {
  const trimmed = value.trim();
  if (!trimmed.startsWith('```') || !trimmed.endsWith('```')) return trimmed;
  let body = trimmed.slice(3, -3);
  if (body.toLowerCase().startsWith('json')) body = body.slice(4);
  // Opening and closing fences must not overlap (a lone ``` or ```` is no fence).
  return trimmed.length >= 6 ? body.trim() : trimmed;
}

function parseDraftJson(content: string): unknown {
  if (!content.trim()) throw new Error('NVIDIA returned empty storyboard JSON');
  try {
    return JSON.parse(stripJsonFence(content)) as unknown;
  } catch (error) {
    throw new Error('NVIDIA returned malformed storyboard JSON', {
      cause: error,
    });
  }
}

export function buildNvidiaStoryboardSystemPrompt(): string {
  return `/no_think
你是 Zap Pilot 的繁體中文 storyboard 編排器。你只能重新編排提供的 canonical script，不能搜尋新聞、補充事實、判斷授權或產生 TTS。

只輸出單一 JSON object，不要 Markdown。JSON 只能有 slides；每張 slide 只能使用指定 template 的欄位。

共同規則：
- 每張 slide 必須填 startSentenceId、endSentenceId，依序、連續、不可重疊或漏句。
- 第一張必須是 cover；其餘不得是 cover。
- 每張非 cover 必須填 evidenceText，而且必須逐字複製自該 sentence range 的 canonical 原文。
- imageSearchIntent 只能是 0 到 3 個搜尋關鍵詞，不得輸出圖片 URL、來源、授權、slide ID 或時間。
- 所有人名、機構、事件、日期、數字與單位都必須已存在 evidenceText；不得新增推論。
- 90 秒內容使用 8 到 10 張，其他長度約每 9 到 12 秒一張。
- 所有面向觀眾的文字使用繁體中文，保留原稿中的必要英文專名。

template 欄位：
- cover: kicker, headline, subheadline
- photoFact: eyebrow, headline, optional subheadline, facts (1-3)
- statistic: eyebrow, value, optional unit, label, optional secondaryValue, optional secondaryLabel, optional context
- document: issuer, documentNumber, date, headline, excerpt
- sourceQuote: eyebrow, quote, optional context, citation`;
}

export function buildNvidiaStoryboardUserPrompt(
  request: StoryboardProviderRequest,
  options: StoryboardProviderOptions = {},
): string {
  const repair = options.repairIssues?.length
    ? [
        '',
        '上一次輸出未通過驗證。請只修正下列問題並重新輸出完整 JSON：',
        ...options.repairIssues.map(
          (issue) => `- ${issue.path.join('.') || '<root>'}: ${issue.message}`,
        ),
      ]
    : [];

  return [
    `標題：${request.title}`,
    `音訊長度：${request.durationMs} ms`,
    `sentence 數：${request.sentences.length}`,
    '',
    'Canonical sentences（ID 後文字不可改寫為 evidenceText）：',
    formatSentencesForPrompt(request.sentences),
    ...repair,
  ].join('\n');
}

export interface NvidiaStoryboardProviderOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  client?: OpenAI;
}

export function createNvidiaStoryboardProvider(
  providerOptions: NvidiaStoryboardProviderOptions = {},
): StoryboardProvider {
  const model =
    providerOptions.model ??
    process.env['NVIDIA_STORYBOARD_MODEL']?.trim() ??
    DEFAULT_NVIDIA_MODEL;
  const client =
    providerOptions.client ??
    new OpenAI({
      apiKey: providerOptions.apiKey ?? requiredApiKey(),
      baseURL:
        providerOptions.baseURL ??
        process.env['NVIDIA_BASE_URL']?.trim() ??
        DEFAULT_NVIDIA_BASE_URL,
      timeout: NVIDIA_TIMEOUT_MS,
      maxRetries: 0,
    });

  return {
    name: 'nvidia',
    model,
    async generate(
      request: StoryboardProviderRequest,
      requestOptions: StoryboardProviderOptions = {},
    ): Promise<StoryboardProviderResult> {
      const completion = await client.chat.completions.create(
        {
          model,
          messages: [
            { role: 'system', content: buildNvidiaStoryboardSystemPrompt() },
            {
              role: 'user',
              content: buildNvidiaStoryboardUserPrompt(request, requestOptions),
            },
          ],
          temperature: 0.2,
          max_tokens: NVIDIA_MAX_OUTPUT_TOKENS,
          response_format: { type: 'json_object' },
        },
        requestOptions.signal ? { signal: requestOptions.signal } : undefined,
      );
      const usage = completion.usage;
      return {
        draft: parseDraftJson(completion.choices[0]?.message.content ?? ''),
        model: completion.model || model,
        usage: usage
          ? {
              inputTokens: usage.prompt_tokens,
              outputTokens: usage.completion_tokens,
              totalTokens: usage.total_tokens,
            }
          : null,
      };
    },
  };
}
