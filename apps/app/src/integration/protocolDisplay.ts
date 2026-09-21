import {
  PROTOCOL_BRAND,
  protocolBrandKeyFor,
} from '@zapengine/brand-assets/protocols';

export interface ProtocolDisplay {
  label: string;
  known: boolean;
}

export function resolveProtocolDisplay(raw: string): ProtocolDisplay {
  const key = protocolBrandKeyFor(raw);
  return key
    ? { label: PROTOCOL_BRAND[key].label, known: true }
    : { label: raw, known: false };
}
