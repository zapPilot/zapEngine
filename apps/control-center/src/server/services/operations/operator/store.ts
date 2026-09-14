import { z } from 'zod';
import { opsRuntimeRecordSchema } from '@zapengine/types/shared';
import type { ControlCenterConfig } from '../../../config/env.js';
import { OPS_OPERATOR_CADENCE_MS } from '../schedule-interval.js';
import { createConfiguredServiceRoleClient } from '../../supabase.js';

const operatorHeartbeatSchema = z
  .object({
    observedAt: z.string().min(1),
    actor: z.string().min(1),
    state: z.enum(['running', 'succeeded', 'failed']),
    failureStreak: z.number().int().nonnegative(),
    cadenceMinutes: z.number().int().positive().nullish(),
    sourceSha: z.string().min(1).nullish(),
    runId: z.string().min(1).nullish(),
  })
  .nullable();

const renderTargetSchema = z.object({
  episodeId: z.uuid(),
  localizationId: z.uuid(),
  renderStatus: z.string(),
  renderCompletedAt: z.string().nullable(),
  renderLeaseExpiresAt: z.string().nullable(),
  visualStatus: z.string().nullable(),
  visualVersion: z.string().nullable(),
  deploymentOpen: z.boolean(),
  // Optional because Control Center deploys on Vercel while the migration that
  // adds it lands on the Supabase rail: the two can be minutes apart, and a
  // required field would fail every operator read in that window.
  abandonedAt: z.string().nullish(),
});

export type RenderTarget = z.infer<typeof renderTargetSchema>;
export type OperatorHeartbeatState = 'running' | 'succeeded' | 'failed';

export function createOperatorStore(config: ControlCenterConfig) {
  const client = createConfiguredServiceRoleClient(config);
  async function rpc(
    name: string,
    args: Record<string, unknown> = {},
  ): Promise<unknown> {
    if (!client) {
      throw new Error('Operator persistence is not configured.');
    }
    const { data, error } = await client
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(10_000));
    if (error) {
      throw new Error(`Operator persistence failed: ${error.message}`);
    }
    return data;
  }
  return {
    rpc,
    async recordHeartbeat(actor: string, state: OperatorHeartbeatState) {
      const provenance = {
        p_actor: actor,
        p_state: state,
        p_cadence_minutes: Math.round(OPS_OPERATOR_CADENCE_MS / 60_000),
        p_source_sha: process.env['GITHUB_SHA']?.trim() || null,
        p_run_id: process.env['GITHUB_RUN_ID']?.trim() || null,
      };
      try {
        await rpc('ops_record_operator_heartbeat_v2', provenance);
      } catch (error) {
        // Keep the application rail-safe while the additive migration reaches
        // Supabase. The old function still records liveness, but the reader
        // will deliberately mark that heartbeat as lacking cadence provenance.
        if (
          error instanceof Error &&
          /ops_record_operator_heartbeat_v2/i.test(error.message) &&
          /(schema cache|could not find|does not exist)/i.test(error.message)
        ) {
          await rpc('ops_record_operator_heartbeat', {
            p_actor: actor,
            p_state: state,
          });
          return;
        }
        throw error;
      }
    },
    async heartbeat() {
      return operatorHeartbeatSchema.parse(await rpc('ops_operator_heartbeat'));
    },
    async history(fingerprint?: string) {
      return z.array(z.record(z.string(), z.unknown())).parse(
        await rpc('ops_operator_history', {
          p_fingerprint: fingerprint ?? null,
        }),
      );
    },
    async runtime(key: string, value: string) {
      return z
        .array(opsRuntimeRecordSchema)
        .parse(
          await rpc('ops_runtime_records', { p_key: key, p_value: value }),
        );
    },
    async renderTargets(localizationId?: string) {
      return z.array(renderTargetSchema).parse(
        await rpc('ops_render_targets', {
          p_localization_id: localizationId ?? null,
        }),
      );
    },
  };
}
export type OperatorStore = ReturnType<typeof createOperatorStore>;
