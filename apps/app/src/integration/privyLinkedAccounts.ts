/**
 * Shared Privy linked-account shape guard. Kept dependency-free (pure TS, no
 * viem/react-native/app-core) so both the iOS account hook and the native
 * wallet backend model can import it without pulling execution code into the
 * iOS module graph.
 */
export type LinkedAccountRecord = Record<PropertyKey, unknown>;

export function isLinkedAccountRecord(
  value: unknown,
): value is LinkedAccountRecord {
  return typeof value === 'object' && value !== null;
}
