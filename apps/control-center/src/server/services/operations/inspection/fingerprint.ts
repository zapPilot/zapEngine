export interface ParsedOperationalFingerprint {
  source: string;
  kind: string;
  key: string;
}

/**
 * Parse `${source}:${kind}/${key}` without splitting the key. Keys such as
 * `from-fed-to-chain-api/render` legitimately contain `/` themselves.
 */
export function parseOperationalFingerprint(
  fingerprint: string,
): ParsedOperationalFingerprint | null {
  const colon = fingerprint.indexOf(':');
  const slash = fingerprint.indexOf('/', colon + 1);
  if (colon <= 0 || slash <= colon + 1 || slash === fingerprint.length - 1) {
    return null;
  }

  const source = fingerprint.slice(0, colon).trim();
  const kind = fingerprint.slice(colon + 1, slash).trim();
  const key = fingerprint.slice(slash + 1).trim();
  if (!source || !kind || !key) {
    return null;
  }
  return { source, kind, key };
}
