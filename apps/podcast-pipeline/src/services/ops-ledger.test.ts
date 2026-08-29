import fs from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { UsageCostLine } from './cost.js';
import type { LlmAttemptRecord } from './llm.js';

const sentry = vi.hoisted(() => ({ capturePipelineException: vi.fn() }));
const supabase = vi.hoisted(() => ({
  rpc: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock('../observability/sentry.js', () => ({
  capturePipelineException: sentry.capturePipelineException,
}));

vi.mock('./supabase-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./supabase-client.js')>()),
  getPipelineSupabase: () => supabase.getClient(),
}));

import {
  type EpisodeRenderMetrics,
  type PipelineStageRunInput,
  recordPipelineRun,
  RENDER_MACHINE_SHAPE,
  RENDER_PRICING_METRIC_KEY,
  renderStageRun,
  stageRunsFromCostLines,
  stageRunsFromLlmAttempts,
} from './ops-ledger.js';

beforeEach(() => {
  vi.clearAllMocks();
  supabase.getClient.mockReturnValue({ rpc: supabase.rpc });
  supabase.rpc.mockResolvedValue({ data: null, error: null });
});

function runInput(
  stages: PipelineStageRunInput[],
): Parameters<typeof recordPipelineRun>[0] {
  return {
    runId: '00000000-0000-4000-8000-0000000000aa',
    pipeline: 'ingest',
    runRef: 'abcd1234',
    trigger: 'http',
    status: 'completed',
    startedAt: new Date('2026-08-27T00:00:00.000Z'),
    finishedAt: new Date('2026-08-27T00:04:00.000Z'),
    episodeId: '00000000-0000-4000-8000-0000000000bb',
    stages,
    component: 'ingest',
  };
}

function rpcPayload(): Record<string, unknown> {
  return supabase.rpc.mock.calls[0]![1] as Record<string, unknown>;
}

function stagePayloads(): Record<string, unknown>[] {
  return rpcPayload()['p_stages'] as Record<string, unknown>[];
}

function costLine(overrides: Partial<UsageCostLine> = {}): UsageCostLine {
  return {
    category: 'llm',
    label: 'LLM classrooms',
    provider: 'openrouter',
    model: 'anthropic/claude-sonnet-4',
    costUsd: 0.012,
    ...overrides,
  };
}

function renderMetrics(
  overrides: Partial<EpisodeRenderMetrics> = {},
): EpisodeRenderMetrics {
  return {
    status: 'completed',
    wallMs: 480_000,
    durationMs: 900_000,
    narrationDownloadMs: 4_200,
    mediaMs: 120_000,
    chunkEncodeMs: 240_000,
    finalEncodeMs: 90_000,
    downscaleMs: 12_000,
    realtimeFactor: 1.875,
    nodeRssMb: 310.4,
    cgroupCurrentMb: 1_204.8,
    cgroupPeakObservedMb: 3_012.1,
    ...overrides,
  };
}

describe('stageRunsFromCostLines', () => {
  it('maps every cost group onto its ledger stage', () => {
    const stages = stageRunsFromCostLines(
      [
        costLine({ label: 'LLM script' }),
        costLine({ label: 'LLM classrooms', costUsd: 0.008 }),
        costLine({
          category: 'tts',
          label: 'TTS main audio',
          provider: 'fish-audio',
          model: 'speech-1.6',
          costUsd: 0.03,
        }),
        costLine({
          category: 'translate',
          label: 'Google Translate',
          provider: 'google',
          model: 'v2',
          costUsd: 0.001,
        }),
        costLine({ label: 'Something new', costUsd: 0.002 }),
      ],
      { languageCode: 'ja', status: 'completed' },
    );

    // `LLM script` is deliberately absent: script rows are written from
    // attempt records, which carry timing a cost line cannot, and emitting
    // both would count the same spend twice.
    expect(stages.map(({ stage }) => stage)).toEqual([
      'classroom',
      'narration',
      'translation',
      'other',
    ]);
  });

  it('carries provider, model, usage and the reported cost', () => {
    const [stage] = stageRunsFromCostLines(
      [
        costLine({
          category: 'tts',
          label: 'TTS main audio',
          provider: 'fish-audio',
          model: 'speech-1.6',
          costUsd: 0.042,
          usage: { unit: 'character', quantity: 2_800, unitPriceUsd: 0.000015 },
        }),
      ],
      {
        languageCode: 'zh-Hant',
        episodeId: 'episode-1',
        localizationId: 'localization-1',
        status: 'completed',
      },
    );

    expect(stage).toEqual({
      stage: 'narration',
      provider: 'fish-audio',
      model: 'speech-1.6',
      episodeId: 'episode-1',
      localizationId: 'localization-1',
      languageCode: 'zh-Hant',
      status: 'completed',
      usage: { unit: 'character', quantity: 2_800, unitPriceUsd: 0.000015 },
      reportedCostUsd: 0.042,
    });
  });

  it('compacts repeated lines within one localization', () => {
    const stages = stageRunsFromCostLines(
      [
        costLine({
          costUsd: 0.01,
          usage: { unit: 'token', quantity: 1_000, unitPriceUsd: 0.00001 },
        }),
        costLine({
          costUsd: 0.02,
          usage: { unit: 'token', quantity: 2_000, unitPriceUsd: 0.00001 },
        }),
      ],
      { languageCode: 'ja', status: 'completed' },
    );

    expect(stages).toHaveLength(1);
    expect(stages[0]?.reportedCostUsd).toBeCloseTo(0.03, 10);
    expect(stages[0]?.usage?.['quantity']).toBe(3_000);
  });

  it('keeps identical lines from different localizations apart', () => {
    const japanese = stageRunsFromCostLines([costLine()], {
      languageCode: 'ja',
      status: 'completed',
    });
    const english = stageRunsFromCostLines([costLine()], {
      languageCode: 'en',
      status: 'completed',
    });

    expect([...japanese, ...english].map((s) => s.languageCode)).toEqual([
      'ja',
      'en',
    ]);
  });

  it('records an empty breakdown as no stages at all', () => {
    expect(
      stageRunsFromCostLines([], { languageCode: 'ja', status: 'completed' }),
    ).toEqual([]);
  });
});

describe('stageRunsFromLlmAttempts', () => {
  function attempt(
    overrides: Partial<LlmAttemptRecord> = {},
  ): LlmAttemptRecord {
    return {
      operation: 'generateScript',
      attempt: 1,
      model: 'anthropic/claude-sonnet-4',
      provider: 'Wafer',
      status: 'completed',
      startedAt: new Date('2026-08-28T09:20:00.000Z'),
      finishedAt: new Date('2026-08-28T09:23:00.000Z'),
      elapsedMs: 180_000,
      timeoutMs: 600_000,
      inputChars: 13_000,
      outputChars: 12_400,
      promptTokens: 9_100,
      completionTokens: 8_200,
      generationId: 'gen-abc',
      routing: 'throughput',
      errorCategory: null,
      errorMessage: null,
      costUsd: 0.021,
      ...overrides,
    };
  }

  it('carries the timing and usage a cost line cannot express', () => {
    const [stage] = stageRunsFromLlmAttempts([attempt()], {
      languageCode: 'zh-Hant',
      episodeId: 'episode-1',
      localizationId: 'localization-1',
    });

    expect(stage).toEqual({
      stage: 'script',
      provider: 'Wafer',
      model: 'anthropic/claude-sonnet-4',
      status: 'completed',
      episodeId: 'episode-1',
      localizationId: 'localization-1',
      languageCode: 'zh-Hant',
      attempt: 1,
      startedAt: new Date('2026-08-28T09:20:00.000Z'),
      finishedAt: new Date('2026-08-28T09:23:00.000Z'),
      elapsedMs: 180_000,
      usage: {
        timeoutMs: 600_000,
        inputChars: 13_000,
        routing: 'throughput',
        outputChars: 12_400,
        promptTokens: 9_100,
        completionTokens: 8_200,
        generationId: 'gen-abc',
      },
      reportedCostUsd: 0.021,
    });
  });

  it('records a failed attempt as unpriced with its failure reason', () => {
    const [stage] = stageRunsFromLlmAttempts(
      [
        attempt({
          attempt: 2,
          status: 'failed',
          provider: null,
          outputChars: null,
          promptTokens: null,
          completionTokens: null,
          generationId: null,
          costUsd: null,
          routing: 'default',
          errorCategory: 'timeout',
          errorMessage: 'OpenRouter request timed out after 600000ms',
        }),
      ],
      { languageCode: 'zh-Hant' },
    );

    expect(stage?.attempt).toBe(2);
    expect(stage?.status).toBe('failed');
    // A zero would be indistinguishable from a free success on the cost report.
    expect(stage?.reportedCostUsd).toBeUndefined();
    expect(stage?.provider).toBe('unknown');
    expect(stage?.usage).toEqual({
      timeoutMs: 600_000,
      inputChars: 13_000,
      routing: 'default',
      errorCategory: 'timeout',
      errorMessage: 'OpenRouter request timed out after 600000ms',
    });
  });

  it('keeps every attempt of one generation as its own row', () => {
    const stages = stageRunsFromLlmAttempts(
      [
        attempt({ attempt: 1, status: 'failed', costUsd: null }),
        attempt({ attempt: 2 }),
      ],
      { languageCode: 'zh-Hant' },
    );

    expect(stages.map(({ attempt: index, status }) => [index, status])).toEqual(
      [
        [1, 'failed'],
        [2, 'completed'],
      ],
    );
  });
});

describe('renderStageRun', () => {
  it('prices the encode window against the Fly rate card', () => {
    const stage = renderStageRun({
      metrics: renderMetrics(),
      reportedAt: new Date('2026-08-27T00:10:00.000Z'),
      episodeId: 'episode-1',
      localizationId: 'localization-1',
      languageCode: 'ja',
      attempt: 2,
      jobWallMs: 512_000,
    });

    expect(stage.stage).toBe('video_render');
    expect(stage.provider).toBe('fly');
    expect(stage.attempt).toBe(2);
    expect(stage.elapsedMs).toBe(480_000);
    expect(stage.pricing).toEqual({
      metricKey: RENDER_PRICING_METRIC_KEY,
      quantity: 480,
    });
    expect(stage.reportedCostUsd).toBeUndefined();
    // The encode ended when the processor reported, so its start is derived
    // backwards from the measured wall time rather than from the write.
    expect(stage.startedAt?.toISOString()).toBe('2026-08-27T00:02:00.000Z');
    expect(stage.finishedAt?.toISOString()).toBe('2026-08-27T00:10:00.000Z');
    expect(stage.usage).toEqual({
      machine: RENDER_MACHINE_SHAPE,
      jobWallMs: 512_000,
      durationMs: 900_000,
      narrationDownloadMs: 4_200,
      realtimeFactor: 1.875,
      nodeRssMb: 310.4,
      mediaMs: 120_000,
      chunkEncodeMs: 240_000,
      finalEncodeMs: 90_000,
      downscaleMs: 12_000,
      cgroupCurrentMb: 1_204.8,
      cgroupPeakObservedMb: 3_012.1,
    });
  });

  it('records a failed render and omits the encode phases it never reached', () => {
    const stage = renderStageRun({
      metrics: {
        status: 'failed',
        wallMs: 61_000,
        durationMs: 900_000,
        narrationDownloadMs: 4_200,
        realtimeFactor: 14.754,
        nodeRssMb: 280,
      },
      reportedAt: new Date('2026-08-27T00:10:00.000Z'),
      episodeId: 'episode-1',
      localizationId: 'localization-1',
      languageCode: 'en',
      attempt: 3,
      jobWallMs: 70_000,
    });

    expect(stage.status).toBe('failed');
    expect(stage.pricing?.quantity).toBe(61);
    expect(stage.usage).not.toHaveProperty('mediaMs');
    expect(stage.usage).not.toHaveProperty('cgroupPeakObservedMb');
  });
});

describe('recordPipelineRun', () => {
  it('sends the run and its provider-reported stages to the bridge RPC', async () => {
    await recordPipelineRun(
      runInput(
        stageRunsFromCostLines([costLine()], {
          languageCode: 'ja',
          episodeId: '00000000-0000-4000-8000-0000000000bb',
          localizationId: '00000000-0000-4000-8000-0000000000cc',
          status: 'completed',
        }),
      ),
    );

    expect(supabase.rpc).toHaveBeenCalledWith(
      'ops_record_pipeline_run',
      expect.objectContaining({
        p_run_id: '00000000-0000-4000-8000-0000000000aa',
        p_pipeline: 'ingest',
        p_run_ref: 'abcd1234',
        p_episode_id: '00000000-0000-4000-8000-0000000000bb',
        p_trigger: 'http',
        p_status: 'completed',
        p_started_at: '2026-08-27T00:00:00.000Z',
        p_finished_at: '2026-08-27T00:04:00.000Z',
      }),
    );
    expect(stagePayloads()).toEqual([
      {
        episode_id: '00000000-0000-4000-8000-0000000000bb',
        localization_id: '00000000-0000-4000-8000-0000000000cc',
        language_code: 'ja',
        stage: 'classroom',
        provider: 'openrouter',
        model: 'anthropic/claude-sonnet-4',
        attempt: 1,
        status: 'completed',
        started_at: null,
        finished_at: null,
        elapsed_ms: null,
        usage: {},
        pricing_basis: 'provider_reported',
        reported_cost_usd: 0.012,
        pricing_metric_key: null,
        quantity: null,
      },
    ]);
  });

  it('sends a rate-card stage as a quantity for the RPC to price', async () => {
    await recordPipelineRun(
      runInput([
        renderStageRun({
          metrics: renderMetrics(),
          reportedAt: new Date('2026-08-27T00:10:00.000Z'),
          episodeId: 'episode-1',
          localizationId: 'localization-1',
          languageCode: 'ja',
          attempt: 1,
          jobWallMs: 512_000,
        }),
      ]),
    );

    expect(stagePayloads()[0]).toMatchObject({
      stage: 'video_render',
      provider: 'fly',
      pricing_basis: 'rate_card',
      pricing_metric_key: RENDER_PRICING_METRIC_KEY,
      quantity: 480,
      reported_cost_usd: null,
      elapsed_ms: 480_000,
      started_at: '2026-08-27T00:02:00.000Z',
    });
  });

  it('marks a stage carrying no cost information as unpriced', async () => {
    await recordPipelineRun(
      runInput([{ stage: 'other', provider: 'internal', status: 'completed' }]),
    );

    expect(stagePayloads()[0]).toMatchObject({
      pricing_basis: 'unpriced',
      reported_cost_usd: null,
      pricing_metric_key: null,
      quantity: null,
    });
  });

  it('prefers a provider-reported amount when a caller casts past the union', async () => {
    await recordPipelineRun(
      runInput([
        {
          stage: 'other',
          provider: 'fly',
          status: 'completed',
          reportedCostUsd: 0.5,
          pricing: { metricKey: RENDER_PRICING_METRIC_KEY, quantity: 10 },
        } as unknown as PipelineStageRunInput,
      ]),
    );

    expect(stagePayloads()[0]).toMatchObject({
      pricing_basis: 'provider_reported',
      reported_cost_usd: 0.5,
      pricing_metric_key: null,
      quantity: null,
    });
  });

  it('reports a rejected RPC as a warning without throwing', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    supabase.rpc.mockResolvedValue({
      data: null,
      error: { code: '42883', message: 'function does not exist' },
    });

    await expect(recordPipelineRun(runInput([]))).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      '[ops-ledger] pipeline run not recorded',
      expect.objectContaining({ pipeline: 'ingest', runRef: 'abcd1234' }),
    );
    expect(sentry.capturePipelineException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: expect.stringContaining('function does not exist'),
      }),
      expect.objectContaining({ component: 'ingest', level: 'warning' }),
    );
    consoleError.mockRestore();
  });

  it('survives an RPC that throws instead of returning an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabase.rpc.mockRejectedValue(new Error('socket hang up'));

    await expect(recordPipelineRun(runInput([]))).resolves.toBeUndefined();

    expect(sentry.capturePipelineException).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'socket hang up' }),
      expect.objectContaining({ level: 'warning' }),
    );
  });

  it('survives a Supabase client that cannot even be constructed', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    supabase.getClient.mockImplementation(() => {
      throw new Error('Missing required environment variable: SUPABASE_URL');
    });

    await expect(recordPipelineRun(runInput([]))).resolves.toBeUndefined();

    expect(sentry.capturePipelineException).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Missing required environment variable: SUPABASE_URL',
      }),
      expect.objectContaining({ level: 'warning' }),
    );
  });
});

describe('render machine constants', () => {
  const flyToml = fs.readFileSync(path.join(process.cwd(), 'fly.toml'), 'utf8');

  function renderVmBlock(): string {
    const block = flyToml
      .split(/^\[\[vm\]\]$/m)
      .slice(1)
      .find((section) => /processes\s*=\s*\['render'\]/.test(section));
    expect(block).toBeDefined();
    return block!;
  }

  // Fly exposes no runtime signal for the machine a process group runs on, so
  // the shape is a constant. Without this test a resize would keep pricing
  // renders at the old rate with nothing going red.
  it('matches the shape fly.toml gives the render process group', () => {
    const block = renderVmBlock();
    const size = /size\s*=\s*'([^']+)'/.exec(block)?.[1];
    const memory = /memory\s*=\s*'([^']+)'/.exec(block)?.[1];

    expect(`${size}-${memory}`).toBe(RENDER_MACHINE_SHAPE);
    expect(RENDER_PRICING_METRIC_KEY).toBe(
      `machine_second_${size?.replaceAll('-', '_')}_${memory}`,
    );
  });
});
