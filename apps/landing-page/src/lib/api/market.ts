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
const LABEL = {
  regime: 'Regime',
  fgi: 'FGI',
  dma: '200MA Δ',
} as const;

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

function buildRegimeItem(
  response: RegimeHistoryResponse,
): RegimeStripItem | null {
  const regimeId = response.current?.to_regime ?? response.current?.regime_id;
  if (regimeId === undefined) {
    return null;
  }

  const value = REGIME_LABELS[regimeId];
  if (value === undefined) {
    return null;
  }

  return {
    label: LABEL.regime,
    value,
    detail: REGIME_DETAILS[regimeId] ?? value,
  };
}

function buildSentimentItem(
  response: MarketSentimentResponse,
): RegimeStripItem | null {
  if (typeof response.value !== 'number' || !Number.isFinite(response.value)) {
    return null;
  }

  const status = response.status?.trim();
  return {
    label: LABEL.fgi,
    value: String(response.value),
    detail: status ? `${status} zone` : 'Fear & Greed Index',
  };
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

function buildDashboardItem(
  response: MarketDashboardResponse,
): RegimeStripItem | null {
  const delta = getLatestBtcDmaDelta(response);
  if (delta === null) {
    return null;
  }

  return {
    label: LABEL.dma,
    value: formatDelta(delta),
    detail: delta >= 0 ? 'Above trend' : 'Below trend',
  };
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

  const regimeItem =
    regimeResult.status === 'fulfilled'
      ? buildRegimeItem(regimeResult.value)
      : null;
  const sentimentItem =
    sentimentResult.status === 'fulfilled'
      ? buildSentimentItem(sentimentResult.value)
      : null;
  const dashboardItem =
    dashboardResult.status === 'fulfilled'
      ? buildDashboardItem(dashboardResult.value)
      : null;

  if (regimeItem === null || sentimentItem === null || dashboardItem === null) {
    return null;
  }

  return { items: [regimeItem, sentimentItem, dashboardItem] };
}
