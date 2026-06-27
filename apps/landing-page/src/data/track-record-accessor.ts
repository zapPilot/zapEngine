import type {
  DailySnapshot,
  RebalanceLog,
  TrackRecordMeta,
} from '@zapengine/types/strategy';
import {
  DailySnapshotSchema,
  RebalanceLogSchema,
  TrackRecordMetaSchema,
} from '@zapengine/types/strategy';
import {
  getAddress,
  isAddress,
  keccak256,
  recoverMessageAddress,
  toBytes,
} from 'viem';

const DEFAULT_GATEWAYS = [
  process.env['NEXT_PUBLIC_IPFS_GATEWAY'] ?? 'https://ipfs.io/ipfs',
  process.env['NEXT_PUBLIC_IPFS_GATEWAY_FALLBACK'] ??
    'https://cloudflare-ipfs.com/ipfs',
  'https://dweb.link/ipfs',
];

const GATEWAY_TIMEOUT_MS = 8_000;

async function fetchFromGateway(
  url: string,
  signal: AbortSignal,
): Promise<unknown> {
  const res = await fetch(url, {
    signal,
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
}

async function fetchFromIpfs(
  cid: string,
  gateways: string[] = DEFAULT_GATEWAYS,
): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GATEWAY_TIMEOUT_MS);

  try {
    for (const gateway of gateways) {
      const url = `${gateway.replace(/\/$/, '')}/${cid}`;
      try {
        const data = await fetchFromGateway(url, controller.signal);
        return data;
      } catch {
        // fall through to next gateway
      }
    }
    throw new Error(
      `All ${gateways.length} IPFS gateways failed for CID: ${cid}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMeta(): Promise<TrackRecordMeta> {
  const res = await fetch('/track-record-meta.json');
  if (!res.ok) throw new Error(`Failed to fetch meta: ${res.status}`);
  const raw: unknown = await res.json();
  return TrackRecordMetaSchema.parse(raw);
}

async function fetchLatestSnapshot(
  meta: TrackRecordMeta,
): Promise<DailySnapshot> {
  if (!meta.latestSnapshotCid) {
    throw new Error('No latestSnapshotCid in meta');
  }
  const raw = await fetchFromIpfs(meta.latestSnapshotCid);
  return DailySnapshotSchema.parse(raw);
}

async function fetchSnapshotHistory(
  entryCid: string,
  limit = 90,
): Promise<DailySnapshot[]> {
  const snapshots: DailySnapshot[] = [];
  let currentCid: string | null = entryCid;
  const visited = new Set<string>();

  while (currentCid && snapshots.length < limit) {
    if (visited.has(currentCid)) break;
    visited.add(currentCid);

    const raw = await fetchFromIpfs(currentCid);
    const snapshot = DailySnapshotSchema.parse(raw);
    snapshots.unshift(snapshot);
    currentCid = snapshot.previousCid ?? null;
  }

  return snapshots;
}

async function fetchRebalanceLog(cid: string): Promise<RebalanceLog> {
  const raw = await fetchFromIpfs(cid);
  return RebalanceLogSchema.parse(raw);
}

export interface PerformanceSummary {
  totalDays: number;
  startDate: string;
  endDate: string;
  startNav: string;
  endNav: string;
  cumulativeReturn: string;
  annualizedReturn: string;
  maxDrawdown: string;
  maxDrawdownDate: string;
  volatility30d: string;
  sharpe: string;
  sortino: string;
  bestDay: string;
  bestDayDate: string;
  worstDay: string;
  worstDayDate: string;
  timeUnderwater: string;
  bestMonth: string;
  bestMonthDate: string;
}

function computeDailyReturns(snapshots: DailySnapshot[]): number[] {
  const returns: number[] = [];
  for (let i = 1; i < snapshots.length; i++) {
    const prev = parseFloat(snapshots[i - 1]!.nav.usd);
    const curr = parseFloat(snapshots[i]!.nav.usd);
    if (prev === 0) {
      returns.push(0);
    } else {
      returns.push((curr - prev) / prev);
    }
  }
  return returns;
}

function computeRollingVolatility(returns: number[], window: number): number[] {
  const volatilities: number[] = [];
  for (let i = window; i <= returns.length; i++) {
    const windowReturns = returns.slice(i - window, i);
    const mean = windowReturns.reduce((a, b) => a + b, 0) / window;
    const squaredDiffs = windowReturns.map((r) => (r - mean) ** 2);
    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / window;
    volatilities.push(Math.sqrt(variance * 252));
  }
  return volatilities;
}

function computeDownsideDeviation(returns: number[]): number {
  const negativeReturns = returns.filter((r) => r < 0);
  if (negativeReturns.length === 0) return 0;
  const squaredNegatives = negativeReturns.map((r) => r ** 2);
  const avgSquared =
    squaredNegatives.reduce((a, b) => a + b, 0) / negativeReturns.length;
  return Math.sqrt(avgSquared * 252);
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(2)}%`;
}

function formatPercentSigned(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${(value * 100).toFixed(2)}%`;
}

function computePerformanceSummary(
  snapshots: DailySnapshot[],
): PerformanceSummary {
  if (snapshots.length === 0) {
    return {
      totalDays: 0,
      startDate: '',
      endDate: '',
      startNav: '0',
      endNav: '0',
      cumulativeReturn: '0.00%',
      annualizedReturn: '0.00%',
      maxDrawdown: '0.00%',
      maxDrawdownDate: '',
      volatility30d: '0.00%',
      sharpe: '—',
      sortino: '—',
      bestDay: '0.00%',
      bestDayDate: '',
      worstDay: '0.00%',
      worstDayDate: '',
      timeUnderwater: '0 days',
      bestMonth: '0.00%',
      bestMonthDate: '',
    };
  }

  const first = snapshots[0]!;
  const last = snapshots[snapshots.length - 1]!;
  const firstNav = parseFloat(first.nav.usd);
  const lastNav = parseFloat(last.nav.usd);

  const cumulativeReturn = lastNav / firstNav - 1;
  const totalDays = snapshots.length;
  const years = totalDays / 365;
  const annualizedReturn =
    years > 0 ? Math.pow(lastNav / firstNav, 1 / years) - 1 : 0;

  const navs = snapshots.map((s) => parseFloat(s.nav.usd));
  let peak = navs[0]!;
  let maxDrawdown = 0;
  let maxDrawdownDate = first.date;
  let underwaterDays = 0;

  const dailyReturns = computeDailyReturns(snapshots);

  for (let i = 0; i < navs.length; i++) {
    const navVal = navs[i]!;
    if (navVal > peak) {
      peak = navVal;
    }
    const drawdown = (peak - navVal) / peak;
    if (drawdown > maxDrawdown) {
      maxDrawdown = drawdown;
      maxDrawdownDate = snapshots[i]!.date;
    }
    if (drawdown > 0) {
      underwaterDays++;
    }
  }

  let bestDay = -Infinity;
  let bestDayDate = '';
  let worstDay = Infinity;
  let worstDayDate = '';
  for (let i = 0; i < dailyReturns.length; i++) {
    const ret = dailyReturns[i]!;
    if (ret > bestDay) {
      bestDay = ret;
      bestDayDate = snapshots[i + 1]!.date;
    }
    if (ret < worstDay) {
      worstDay = ret;
      worstDayDate = snapshots[i + 1]!.date;
    }
  }

  const volatility30dList = computeRollingVolatility(dailyReturns, 30);
  const avgVol30d =
    volatility30dList.length > 0
      ? volatility30dList.reduce((a, b) => a + b, 0) / volatility30dList.length
      : 0;

  const meanReturn =
    dailyReturns.length > 0
      ? dailyReturns.reduce((a, b) => a + b, 0) / dailyReturns.length
      : 0;
  const annualMean = meanReturn * 252;
  const annualVol = avgVol30d;
  const sharpe = annualVol > 0 ? (annualMean / annualVol).toFixed(2) : '—';

  const downsideDev = computeDownsideDeviation(dailyReturns);
  const sortino = downsideDev > 0 ? (annualMean / downsideDev).toFixed(2) : '—';

  return {
    totalDays,
    startDate: first.date,
    endDate: last.date,
    startNav: firstNav.toFixed(2),
    endNav: lastNav.toFixed(2),
    cumulativeReturn: formatPercentSigned(cumulativeReturn),
    annualizedReturn: formatPercentSigned(annualizedReturn),
    maxDrawdown: formatPercent(-maxDrawdown),
    maxDrawdownDate,
    volatility30d: formatPercent(avgVol30d),
    sharpe,
    sortino,
    bestDay: formatPercentSigned(bestDay),
    bestDayDate,
    worstDay: formatPercentSigned(worstDay),
    worstDayDate,
    timeUnderwater: `${underwaterDays} days`,
    bestMonth: '0.00%',
    bestMonthDate: '',
  };
}

export interface ChainVerification {
  valid: boolean;
  brokenAt?: number;
  totalSnapshots: number;
  reason?: string;
}

export interface PerformanceVerification {
  valid: boolean;
  checkedSnapshots: number;
  errors: string[];
}

const PERFORMANCE_PERCENT_TOLERANCE = 0.02;
const PERFORMANCE_RATIO_TOLERANCE = 0.02;

function parsePercentValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace('%', ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRatioValue(value: string | undefined): number | null {
  if (!value || value === '—') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function annualizedVolatility(returns: number[]): number {
  if (returns.length === 0) return 0;
  const avg = mean(returns);
  const variance =
    returns.reduce((sum, value) => sum + (value - avg) ** 2, 0) /
    returns.length;
  return Math.sqrt(variance * 252);
}

function annualizedDownsideDeviation(returns: number[]): number {
  const negativeReturns = returns.filter((value) => value < 0);
  if (negativeReturns.length === 0) return 0;
  return Math.sqrt(
    (negativeReturns.reduce((sum, value) => sum + value ** 2, 0) /
      negativeReturns.length) *
      252,
  );
}

function verifyPerformanceMetrics(
  snapshots: DailySnapshot[],
): PerformanceVerification {
  const errors: string[] = [];
  if (snapshots.length === 0) {
    return { valid: true, checkedSnapshots: 0, errors };
  }

  const firstNav = Number(snapshots[0]!.nav.usd);
  if (!Number.isFinite(firstNav) || firstNav <= 0) {
    return {
      valid: false,
      checkedSnapshots: snapshots.length,
      errors: ['first snapshot NAV is not a positive number'],
    };
  }

  const dailyReturns: number[] = [];
  let peakNav = firstNav;

  for (let i = 0; i < snapshots.length; i++) {
    const snapshot = snapshots[i]!;
    const nav = Number(snapshot.nav.usd);
    if (!Number.isFinite(nav) || nav <= 0) {
      errors.push(`[${i}] ${snapshot.date}: NAV is not a positive number`);
      continue;
    }

    const storedCumulative = parsePercentValue(
      snapshot.performance.cumulativeReturn,
    );
    const recomputedCumulative = (nav / firstNav - 1) * 100;
    if (
      storedCumulative !== null &&
      Math.abs(storedCumulative - recomputedCumulative) >
        PERFORMANCE_PERCENT_TOLERANCE
    ) {
      errors.push(`[${i}] ${snapshot.date}: cumulativeReturn mismatch`);
    }

    if (nav > peakNav) peakNav = nav;
    const storedDrawdown = parsePercentValue(snapshot.performance.maxDrawdown);
    const recomputedDrawdown = (nav / peakNav - 1) * 100;
    if (
      storedDrawdown !== null &&
      Math.abs(storedDrawdown - recomputedDrawdown) >
        PERFORMANCE_PERCENT_TOLERANCE
    ) {
      errors.push(`[${i}] ${snapshot.date}: maxDrawdown mismatch`);
    }

    if (i === 0) {
      dailyReturns.push(0);
      continue;
    }

    const previousNav = Number(snapshots[i - 1]!.nav.usd);
    const dailyReturn = previousNav > 0 ? nav / previousNav - 1 : 0;
    dailyReturns.push(dailyReturn);

    const storedDaily = parsePercentValue(snapshot.performance.dailyReturn);
    if (
      storedDaily !== null &&
      Math.abs(storedDaily - dailyReturn * 100) > PERFORMANCE_PERCENT_TOLERANCE
    ) {
      errors.push(`[${i}] ${snapshot.date}: dailyReturn mismatch`);
    }

    const rollingReturns = dailyReturns.slice(Math.max(1, i - 29), i + 1);
    if (rollingReturns.length >= 30) {
      const vol30d = annualizedVolatility(rollingReturns);
      const storedVol = parsePercentValue(snapshot.performance.volatility30d);
      if (
        storedVol !== null &&
        Math.abs(storedVol - vol30d * 100) > PERFORMANCE_PERCENT_TOLERANCE
      ) {
        errors.push(`[${i}] ${snapshot.date}: volatility30d mismatch`);
      }

      const annualMean = mean(rollingReturns) * 252;
      const storedSharpe = parseRatioValue(snapshot.performance.sharpe);
      if (storedSharpe !== null && vol30d > 0) {
        const recomputedSharpe = annualMean / vol30d;
        if (
          Math.abs(storedSharpe - recomputedSharpe) >
          PERFORMANCE_RATIO_TOLERANCE
        ) {
          errors.push(`[${i}] ${snapshot.date}: sharpe mismatch`);
        }
      }

      const downsideDeviation = annualizedDownsideDeviation(rollingReturns);
      const storedSortino = parseRatioValue(snapshot.performance.sortino);
      if (storedSortino !== null && downsideDeviation > 0) {
        const recomputedSortino = annualMean / downsideDeviation;
        if (
          Math.abs(storedSortino - recomputedSortino) >
          PERFORMANCE_RATIO_TOLERANCE
        ) {
          errors.push(`[${i}] ${snapshot.date}: sortino mismatch`);
        }
      }
    }
  }

  return {
    valid: errors.length === 0,
    checkedSnapshots: snapshots.length,
    errors,
  };
}

export interface SnapshotHistoryEntry {
  cid: string;
  snapshot: DailySnapshot;
}

async function fetchSnapshotHistoryEntries(
  entryCid: string,
  limit = 90,
): Promise<SnapshotHistoryEntry[]> {
  const entries: SnapshotHistoryEntry[] = [];
  let currentCid: string | null = entryCid;
  const visited = new Set<string>();

  while (currentCid && entries.length < limit) {
    if (visited.has(currentCid)) break;
    visited.add(currentCid);

    const raw = await fetchFromIpfs(currentCid);
    const snapshot = DailySnapshotSchema.parse(raw);
    entries.unshift({ cid: currentCid, snapshot });
    currentCid = snapshot.previousCid ?? null;
  }

  return entries;
}

function verifyCidChain(entries: SnapshotHistoryEntry[]): ChainVerification {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (!entry.cid) {
      return {
        valid: false,
        brokenAt: i,
        totalSnapshots: entries.length,
        reason: 'missing_cid',
      };
    }

    if (i === 0) {
      if (entry.snapshot.previousCid !== null) {
        return {
          valid: false,
          brokenAt: 0,
          totalSnapshots: entries.length,
          reason: 'genesis_previous_cid_not_null',
        };
      }
      continue;
    }

    const expectedPreviousCid = entries[i - 1]!.cid;
    if (entry.snapshot.previousCid !== expectedPreviousCid) {
      return {
        valid: false,
        brokenAt: i,
        totalSnapshots: entries.length,
        reason: 'previous_cid_mismatch',
      };
    }
  }
  return { valid: true, brokenAt: undefined, totalSnapshots: entries.length };
}

export interface SignatureVerification {
  valid: boolean;
  signaturePresent: boolean;
  reason?: string;
  expectedSigner?: string;
  claimedSigner?: string;
  recoveredSigner?: string;
  messageHash?: string;
  computedMessageHash?: string;
  messageHashValid?: boolean;
}

function stableStringify(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item) ?? 'null').join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  const pairs = Object.keys(record)
    .sort()
    .flatMap((key) => {
      const serialized = stableStringify(record[key]);
      return serialized === undefined
        ? []
        : [`${JSON.stringify(key)}:${serialized}`];
    });

  return `{${pairs.join(',')}}`;
}

function canonicalizeSnapshotForSigning(snapshot: DailySnapshot): string {
  const unsignedSnapshot: Record<string, unknown> = { ...snapshot };
  delete unsignedSnapshot['signature'];
  return stableStringify(unsignedSnapshot) ?? '{}';
}

function createSnapshotMessageHash(snapshot: DailySnapshot): `0x${string}` {
  return keccak256(toBytes(canonicalizeSnapshotForSigning(snapshot)));
}

async function verifySignature(
  snapshot: DailySnapshot,
  expectedSigner: string,
): Promise<SignatureVerification> {
  if (!snapshot.signature) {
    return {
      valid: !expectedSigner,
      signaturePresent: false,
      reason: expectedSigner ? 'missing_signature' : 'unsigned_optional',
    };
  }

  try {
    const claimedSigner = snapshot.signature.signer;
    const messageHash = snapshot.signature.messageHash;
    const signature = snapshot.signature.signature;
    const computedMessageHash = createSnapshotMessageHash(snapshot);

    if (!messageHash || !signature || !claimedSigner) {
      return {
        valid: false,
        signaturePresent: true,
        reason: 'missing_signature_field',
      };
    }

    if (!isAddress(claimedSigner)) {
      return {
        valid: false,
        signaturePresent: true,
        claimedSigner,
        reason: 'invalid_claimed_signer',
      };
    }

    if (expectedSigner && !isAddress(expectedSigner)) {
      return {
        valid: false,
        signaturePresent: true,
        claimedSigner: getAddress(claimedSigner),
        expectedSigner,
        reason: 'invalid_expected_signer',
      };
    }

    const messageHashValid =
      messageHash.toLowerCase() === computedMessageHash.toLowerCase();

    if (!messageHashValid) {
      return {
        valid: false,
        signaturePresent: true,
        claimedSigner: getAddress(claimedSigner),
        expectedSigner: expectedSigner ? getAddress(expectedSigner) : undefined,
        messageHash,
        computedMessageHash,
        messageHashValid: false,
        reason: 'message_hash_mismatch',
      };
    }

    const recoveredSigner = await recoverMessageAddress({
      message: { raw: computedMessageHash },
      signature: signature as `0x${string}`,
    });
    const normalizedClaimedSigner = getAddress(claimedSigner);
    const normalizedExpectedSigner = expectedSigner
      ? getAddress(expectedSigner)
      : normalizedClaimedSigner;

    if (getAddress(recoveredSigner) !== normalizedExpectedSigner) {
      return {
        valid: false,
        signaturePresent: true,
        claimedSigner: normalizedClaimedSigner,
        expectedSigner: normalizedExpectedSigner,
        recoveredSigner: getAddress(recoveredSigner),
        messageHash,
        computedMessageHash,
        messageHashValid: true,
        reason: 'signer_mismatch',
      };
    }

    if (normalizedClaimedSigner !== getAddress(recoveredSigner)) {
      return {
        valid: false,
        signaturePresent: true,
        claimedSigner: normalizedClaimedSigner,
        expectedSigner: normalizedExpectedSigner,
        recoveredSigner: getAddress(recoveredSigner),
        messageHash,
        computedMessageHash,
        messageHashValid: true,
        reason: 'claimed_signer_mismatch',
      };
    }

    return {
      valid: true,
      signaturePresent: true,
      claimedSigner: normalizedClaimedSigner,
      expectedSigner: normalizedExpectedSigner,
      recoveredSigner: getAddress(recoveredSigner),
      messageHash,
      computedMessageHash,
      messageHashValid: true,
    };
  } catch {
    return {
      valid: false,
      signaturePresent: true,
      reason: 'recover_failed',
    };
  }
}

export {
  fetchMeta,
  fetchLatestSnapshot,
  fetchSnapshotHistory,
  fetchSnapshotHistoryEntries,
  fetchRebalanceLog,
  computePerformanceSummary,
  verifyCidChain,
  verifyPerformanceMetrics,
  verifySignature,
  createSnapshotMessageHash,
  canonicalizeSnapshotForSigning,
};
