export function compareVersions(a: string, b: string): -1 | 0 | 1 | undefined {
  if (![a, b].every((value) => /^\d+(\.\d+)*$/.test(value))) return undefined;
  const left = a.split('.').map(BigInt),
    right = b.split('.').map(BigInt);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i] ?? 0n,
      y = right[i] ?? 0n;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}
