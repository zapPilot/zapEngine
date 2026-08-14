import { readFile } from 'node:fs/promises';

export const IPFS_GATEWAYS = [
  'https://ipfs.io/ipfs',
  'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
] as const;

/**
 * Fetch and parse JSON, with `file://` support for local metadata and fixtures.
 */
export async function fetchJson(
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  if (url.startsWith('file://')) {
    return JSON.parse(await readFile(new URL(url), 'utf8'));
  }

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error(
      `Invalid JSON from ${url}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Read a CID through the gateway list, falling through on any failure. */
export async function fetchFromIpfs(cid: string): Promise<unknown> {
  for (const gateway of IPFS_GATEWAYS) {
    try {
      return await fetchJson(`${gateway}/${cid}`, 12_000);
    } catch {
      // Try the next gateway.
    }
  }
  throw new Error(`All IPFS gateways failed for CID: ${cid}`);
}
