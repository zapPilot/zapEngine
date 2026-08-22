export function currentUtcPeriod(now: Date): {
  periodStart: string;
  periodEnd: string;
} {
  return {
    periodStart: new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1),
    ).toISOString(),
    periodEnd: now.toISOString(),
  };
}

export function projectMonthEnd(value: number, now: Date): number {
  if (value === 0) {
    return 0;
  }
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1);
  const elapsed = Math.max(now.getTime() - start, 60 * 60 * 1000);
  return roundUsd(value * ((end - start) / elapsed));
}

export function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}
