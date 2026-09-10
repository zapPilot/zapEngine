import {
  opsRuntimeRecordSchema,
  type OpsRuntimeRecord,
} from '@zapengine/types/shared';

/** Only producer-attested, same-namespace values can create a runtime edge. */
export function correlateRuntimeRecords(
  raw: unknown[],
  seed: OpsRuntimeRecord,
) {
  const records = raw
    .flatMap((entry) => {
      const parsed = opsRuntimeRecordSchema.safeParse(entry);
      return parsed.success && parsed.data.service === seed.service
        ? [parsed.data]
        : [];
    })
    .slice(0, 100);
  const connected = [seed];
  const edges: {
    from: string;
    to: string;
    key: string;
    value: string;
    source: string;
  }[] = [];
  const seen = new Set([`${seed.source}:${seed.recordId}`]);
  for (let index = 0; index < connected.length; index++) {
    const current = connected[index]!;
    for (const candidate of records) {
      const identity = `${candidate.source}:${candidate.recordId}`;
      if (seen.has(identity) || connected.length >= 100) {
        continue;
      }
      const match = Object.entries(current.correlation).find(
        ([key, value]) =>
          value &&
          candidate.correlation[key as keyof typeof candidate.correlation] ===
            value,
      );
      if (!match) {
        continue;
      }
      seen.add(identity);
      connected.push(candidate);
      edges.push({
        from: `${current.source}:${current.recordId}`,
        to: identity,
        key: match[0],
        value: match[1],
        source: candidate.source,
      });
    }
  }
  return {
    records: connected,
    edges,
    gaps:
      connected.length === 1
        ? ['No producer-attested runtime edge is available.']
        : [],
  };
}
