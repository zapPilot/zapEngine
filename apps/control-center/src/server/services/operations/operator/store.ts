import { z } from 'zod';
import { opsRuntimeRecordSchema } from '@zapengine/types/shared';
import type { ControlCenterConfig } from '../../../config/env.js';
import { createConfiguredServiceRoleClient } from '../../supabase.js';

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
      return z
        .array(
          z.object({
            episodeId: z.uuid(),
            localizationId: z.uuid(),
            renderStatus: z.string(),
            renderCompletedAt: z.string().nullable(),
            renderLeaseExpiresAt: z.string().nullable(),
            visualStatus: z.string().nullable(),
            visualVersion: z.string().nullable(),
            deploymentOpen: z.boolean(),
          }),
        )
        .parse(
          await rpc('ops_render_targets', {
            p_localization_id: localizationId ?? null,
          }),
        );
    },
  };
}
export type OperatorStore = ReturnType<typeof createOperatorStore>;
