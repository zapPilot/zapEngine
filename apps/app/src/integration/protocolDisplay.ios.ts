import type { ProtocolDisplay } from '@/integration/protocolDisplay';

export function resolveProtocolDisplay(raw: string): ProtocolDisplay {
  return { label: raw, known: false };
}
