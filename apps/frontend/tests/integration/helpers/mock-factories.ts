export function createMockArray<T>(
  count: number,
  builder: (index: number) => T
): T[] {
  return Array.from({ length: count }, (_, index) => builder(index));
}

export function generateDateSeries(
  start: string | Date,
  days: number
): string[] {
  const startDate = typeof start === "string" ? new Date(start) : start;

  return Array.from({ length: days }, (_, index) => {
    const nextDate = new Date(startDate);
    nextDate.setDate(startDate.getDate() + index);
    return nextDate.toISOString().split("T")[0] ?? nextDate.toISOString();
  });
}
