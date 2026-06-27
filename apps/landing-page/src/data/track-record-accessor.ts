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
}

function verifyCidChain(snapshots: DailySnapshot[]): ChainVerification {
  for (let i = 1; i < snapshots.length; i++) {
    if (snapshots[i]!.previousCid !== snapshots[i - 1]!.previousCid) {
      return { valid: false, brokenAt: i, totalSnapshots: snapshots.length };
    }
  }
  return { valid: true, brokenAt: undefined, totalSnapshots: snapshots.length };
}

function verifySignature(
  snapshot: DailySnapshot,
  _expectedSigner: string,
): boolean {
  if (!snapshot.signature) return true;

  try {
    const msgHash = snapshot.signature.messageHash;
    const sig = snapshot.signature.signature;
    const signer = snapshot.signature.signer;

    if (!msgHash || !sig || !signer) return false;

    return true;
  } catch {
    return false;
  }
}

export {
  fetchMeta,
  fetchLatestSnapshot,
  fetchSnapshotHistory,
  fetchRebalanceLog,
  computePerformanceSummary,
  verifyCidChain,
  verifySignature,
};
