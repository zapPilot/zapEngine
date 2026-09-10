import { z } from 'zod';
import {
  opsRuntimeRecordSchema,
  type OpsRuntimeRecord,
} from '@zapengine/types/shared';
import type { OpsIncidentContext } from '../../../mcp/incident-context.js';
import { correlateRuntimeRecords } from './correlation.js';
import { manualActions, renderAction } from './actions.js';
import type { OperatorStore } from './store.js';

export async function enrichOperatorContext(
  packet: OpsIncidentContext,
  store: OperatorStore,
) {
  try {
    const history = await store.history(packet.incident.fingerprint);
    const localizationId = packet.incident.fingerprint.match(
      /^social-queue:render\/([a-f0-9-]{36})$/,
    )?.[1];
    const targets = localizationId
      ? await store.renderTargets(localizationId)
      : [];
    const target = targets.find(
      (candidate) => candidate.localizationId === localizationId,
    );
    let seed: OpsRuntimeRecord | undefined;
    if (target) {
      seed = opsRuntimeRecordSchema.parse({
        source: 'render',
        service: '@zapengine/podcast-pipeline',
        recordId: target.localizationId,
        observedAt: packet.incident.observedAt,
        correlation: {
          episodeId: target.episodeId,
          localizationId: target.localizationId,
          renderJobId: target.localizationId,
        },
      });
    }
    if (
      !seed &&
      packet.primaryEvidence.evidence['project'] === 'podcast-pipeline'
    ) {
      const event = z
        .object({
          eventId: z.string(),
          createdAt: z.string(),
          correlation: opsRuntimeRecordSchema.shape.correlation,
        })
        .safeParse(packet.primaryEvidence.evidence['sampleEvent']);
      if (event.success) {
        const parsed = opsRuntimeRecordSchema.safeParse({
          source: 'sentry',
          service: '@zapengine/podcast-pipeline',
          recordId: event.data.eventId,
          observedAt: event.data.createdAt,
          correlation: event.data.correlation,
        });
        if (parsed.success) {
          seed = parsed.data;
        }
      }
    }
    const records: OpsRuntimeRecord[] = [];
    if (seed) {
      const queried = new Set<string>();
      records.push(seed);
      // Bounded breadth-first exact lookups; never scan providers for lookalikes.
      for (
        let index = 0;
        index < records.length && queried.size < 12;
        index++
      ) {
        for (const [key, value] of Object.entries(
          records[index]!.correlation,
        )) {
          const query = `${key}:${value}`;
          if (queried.has(query) || queried.size >= 12) {
            continue;
          }
          queried.add(query);
          for (const record of await store.runtime(key, value)) {
            if (
              records.length < 100 &&
              !records.some(
                (r) =>
                  r.source === record.source && r.recordId === record.recordId,
              )
            ) {
              records.push(record);
            }
          }
        }
      }
    }
    return {
      ...packet,
      operator: {
        history,
        actions: target
          ? [
              renderAction(
                {
                  ...target,
                  previousAttempt: history.some(
                    (row) =>
                      Array.isArray(row['actions']) &&
                      row['actions'].length > 0,
                  ),
                },
                false,
              ),
              ...manualActions,
            ]
          : manualActions,
      },
      runtimeCorrelation: seed
        ? correlateRuntimeRecords(records, seed)
        : {
            records: [],
            edges: [],
            gaps: [
              'No concrete producer job identity is available for this signal.',
            ],
          },
    };
  } catch {
    return {
      ...packet,
      operator: { history: [], actions: manualActions },
      runtimeCorrelation: {
        records: [],
        edges: [],
        gaps: [
          'Operator persistence is unavailable; mutation and verification are blocked.',
        ],
      },
    };
  }
}
