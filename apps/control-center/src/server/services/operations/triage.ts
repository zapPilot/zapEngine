import type { OpsTriageHistory } from '@zapengine/types/shared';
import type { OperationalPriority } from '../../../shared/types.js';

export async function attachTriage(
  priorities: OperationalPriority[],
  read: (fingerprints: string[]) => Promise<OpsTriageHistory[]>,
  now: Date,
): Promise<OperationalPriority[]> {
  if (priorities.length === 0) {
    return priorities;
  }
  try {
    const rows = await read([
      ...new Set(
        priorities.flatMap((priority) =>
          sentryAliases(priority.signal.fingerprint),
        ),
      ),
    ]);
    return priorities.map((priority) => {
      const ids =
        priority.signal.evidence['followUpTargets'] ??
        priority.signal.evidence['issueIds'];
      const currentTargets =
        typeof ids === 'string'
          ? ids.split(',').filter(Boolean)
          : [priority.signal.fingerprint];
      const items = rows
        .filter(
          (row) =>
            sentryAliases(priority.signal.fingerprint).includes(
              row.fingerprint,
            ) && currentTargets.includes(row.assessment.target),
        )
        .sort(
          (left, right) =>
            Date.parse(right.recordedAt) - Date.parse(left.recordedAt),
        )
        .filter(
          (row, index, all) =>
            all.findIndex(
              (candidate) =>
                candidate.assessment.target === row.assessment.target,
            ) === index,
        )
        .map((row) => {
          const latest =
            priority.signal.evidence[`lastSeen:${row.assessment.target}`];
          const recurrence =
            priority.signal.source === 'sentry' &&
            (row.assessment.lastSeen === null ||
              typeof latest !== 'string' ||
              !Number.isFinite(Date.parse(latest)) ||
              Date.parse(latest) > Date.parse(row.assessment.lastSeen));
          return {
            ...row,
            reviewRequired:
              recurrence ||
              Date.parse(row.assessment.reviewAfter) <= now.getTime(),
          };
        });
      return {
        ...priority,
        followUp: {
          status: 'available' as const,
          targetCoverage:
            priority.signal.evidence['issueIdsTruncated'] === true ||
            priority.signal.evidence['recentTruncated'] === true ||
            priority.signal.evidence['inventoryTruncated'] === true
              ? ('partial' as const)
              : ('complete' as const),
          unassessedTargets: currentTargets.filter(
            (target) =>
              !items.some((item) => item.assessment.target === target),
          ),
          items,
        },
      };
    });
  } catch {
    return priorities.map((priority) => ({
      ...priority,
      followUp: {
        status: 'unavailable',
        targetCoverage: 'partial',
        unassessedTargets: [],
        items: [],
      },
    }));
  }
}

function sentryAliases(fingerprint: string): string[] {
  const project = /^sentry:(?:issues|stale-unresolved)\/(.+)$/.exec(
    fingerprint,
  )?.[1];
  return project
    ? [`sentry:issues/${project}`, `sentry:stale-unresolved/${project}`]
    : [fingerprint];
}
