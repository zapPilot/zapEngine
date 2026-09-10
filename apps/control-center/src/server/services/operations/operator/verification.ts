import { opsVerificationSchema } from '@zapengine/types/shared';

export function verifyRecovery(
  raw: unknown,
  required: string[],
  now = new Date(),
) {
  const parsed = opsVerificationSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      verified: false,
      blockers: ['Fix/deploy/observation evidence is incomplete.'],
    };
  }
  const value = parsed.data;
  const blockers: string[] = [];
  const start = Date.parse(value.activeAt);
  const end = Date.parse(value.observedUntil);
  if (value.fixSha !== value.deployedSha) {
    blockers.push('Fixed commit is not the deployed commit.');
  }
  if (
    end > now.getTime() ||
    start > end ||
    end - start < value.minimumObservationSeconds * 1000
  ) {
    blockers.push('Deployment observation period is incomplete.');
  }
  if (required.length === 0) {
    blockers.push('Incident verification policy is missing.');
  }
  for (const kind of required) {
    if (
      !value.signals.some(
        (signal) =>
          signal.kind === kind &&
          signal.status === 'recovered' &&
          signal.target === value.target &&
          signal.deployedSha === value.deployedSha &&
          Date.parse(signal.from) <= start &&
          Date.parse(signal.until) >= end,
      )
    ) {
      blockers.push(`Missing complete recovery evidence: ${kind}.`);
    }
  }
  if (value.signals.some((signal) => signal.status !== 'recovered')) {
    blockers.push('A recovery signal failed or is unavailable.');
  }
  return { verified: blockers.length === 0, blockers };
}
