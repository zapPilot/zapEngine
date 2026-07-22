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
你是 Zap Pilot 的影像 storyboard 編排器。你只能把 canonical script 切成搜尋影像用的 scenes，不能搜尋新聞、補充事實、判斷授權、產生畫面文案或產生 TTS。

只輸出單一 JSON object，不要 Markdown。JSON 只能有 scenes。每個 scene 只能有 sceneId、startSentenceId、endSentenceId、imageSearchIntent。

共同規則：
- sceneId 必須依序使用 scene-01、scene-02，以此類推。
- 每個 scene 必須填 startSentenceId、endSentenceId，依序、連續、不可重疊或漏句。
- imageSearchIntent 必須是 1 到 3 個具體影像搜尋短語，每個短語 2 到 80 個字元。
- 搜尋短語應描述可攝影的主體、地點、機構、物件或事件；不得寫旁白、標題、重點、引言、字幕或版面文案。
- 不得輸出圖片 URL、來源、授權、時間、template 或任何顯示文字。
- 所有人名、機構、事件、日期、數字與單位都必須已存在該 scene 的 canonical sentence range；不得新增推論。
- 90 秒內容使用 8 到 10 個 scenes，其他長度約每 9 到 12 秒一個 scene，最多 64 個。`;
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
    'Canonical sentences（只可用來劃分 scene 範圍與建立影像搜尋意圖）：',
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
