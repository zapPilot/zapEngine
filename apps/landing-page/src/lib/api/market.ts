import { MESSAGES } from '@/config/messages';

export type RegimeStripItem = {
  label: string;
  value: string;
  detail: string;
};

export type RegimeStripData = {
  items: RegimeStripItem[];
};

type RegimeHistoryResponse = {
  current?: {
    regime_id?: string;
    to_regime?: string;
  };
};

type MarketSentimentResponse = {
  value?: number;
  status?: string;
};

type MarketDashboardResponse = {
  snapshots?: Array<{
    values?: {
      btc?: {
        value?: number;
        indicators?: {
          dma_200?: {
            value?: number;
          };
        };
      };
    };
  }>;
};

const REQUEST_TIMEOUT_MS = 3_000;
const REGIME_LABELS: Record<string, string> = {
  ef: 'Extreme Fear',
  f: 'Fear',
  n: 'Neutral',
  g: 'Greed',
  eg: 'Extreme Greed',
};
const REGIME_DETAILS: Record<string, string> = {
  ef: 'Buy weakness zone',
  f: 'Accumulation zone',
  n: 'Balanced stance',
  g: 'Risk-on legs active',
  eg: 'Defense watch',
};

function getAnalyticsApiUrl(): string | null {
  const baseUrl = process.env['NEXT_PUBLIC_ANALYTICS_API_URL']?.trim();
  if (!baseUrl) {
    return null;
  }

  return baseUrl.replace(/\/+$/, '');
}

async function fetchJson<T>(baseUrl: string, path: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        Accept: 'application/json',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Market API request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function cloneFallbackItems(): RegimeStripItem[] {
  return MESSAGES.regimeTelemetry.items.map((item) => ({ ...item }));
}

function updateItem(
  items: RegimeStripItem[],
  label: string,
  value: string,
  detail: string,
): boolean {
  const item = items.find((candidate) => candidate.label === label);
  if (item === undefined) {
    return false;
  }

  item.value = value;
  item.detail = detail;
  return true;
}

function applyRegimeData(
  items: RegimeStripItem[],
  response: RegimeHistoryResponse,
): boolean {
  const regimeId = response.current?.regime_id ?? response.current?.to_regime;
  if (regimeId === undefined) {
    return false;
  }

  const value = REGIME_LABELS[regimeId];
  if (value === undefined) {
    return false;
  }

  return updateItem(items, 'Regime', value, REGIME_DETAILS[regimeId] ?? value);
}

function applySentimentData(
  items: RegimeStripItem[],
  response: MarketSentimentResponse,
): boolean {
  if (typeof response.value !== 'number' || !Number.isFinite(response.value)) {
    return false;
  }

  const status = response.status?.trim();
  return updateItem(
    items,
    'FGI',
    String(response.value),
    status ? `${status} zone` : 'Fear & Greed Index',
  );
}

function getLatestBtcDmaDelta(
  response: MarketDashboardResponse,
): number | null {
  const snapshots = response.snapshots;
  if (snapshots === undefined) {
    return null;
  }

  for (let index = snapshots.length - 1; index >= 0; index -= 1) {
    const btc = snapshots[index]?.values?.btc;
    const currentPrice = btc?.value;
    const dma200 = btc?.indicators?.dma_200?.value;

    if (
      typeof currentPrice === 'number' &&
      Number.isFinite(currentPrice) &&
      typeof dma200 === 'number' &&
      Number.isFinite(dma200) &&
      dma200 !== 0
    ) {
      return ((currentPrice - dma200) / dma200) * 100;
    }
  }

  return null;
}

function formatDelta(value: number): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function applyDashboardData(
  items: RegimeStripItem[],
  response: MarketDashboardResponse,
): boolean {
  const delta = getLatestBtcDmaDelta(response);
  if (delta === null) {
    return false;
  }

  return updateItem(
    items,
    '200MA Δ',
    formatDelta(delta),
    delta >= 0 ? 'Above trend' : 'Below trend',
  );
}

export async function fetchRegimeStrip(): Promise<RegimeStripData | null> {
  const baseUrl = getAnalyticsApiUrl();
  if (baseUrl === null) {
    return null;
  }

  const [regimeResult, sentimentResult, dashboardResult] =
    await Promise.allSettled([
      fetchJson<RegimeHistoryResponse>(
        baseUrl,
        '/api/v2/market/regime/history?limit=1',
      ),
      fetchJson<MarketSentimentResponse>(baseUrl, '/api/v2/market/sentiment'),
      fetchJson<MarketDashboardResponse>(
        baseUrl,
        '/api/v2/market/dashboard?days=365',
      ),
    ]);

  const items = cloneFallbackItems();
  let liveItemCount = 0;

  if (
    regimeResult.status === 'fulfilled' &&
    applyRegimeData(items, regimeResult.value)
  ) {
    liveItemCount += 1;
  }

  if (
    sentimentResult.status === 'fulfilled' &&
    applySentimentData(items, sentimentResult.value)
  ) {
    liveItemCount += 1;
  }

  if (
    dashboardResult.status === 'fulfilled' &&
    applyDashboardData(items, dashboardResult.value)
  ) {
    liveItemCount += 1;
  }

  if (liveItemCount === 0) {
    return null;
  }

  return { items };
}
