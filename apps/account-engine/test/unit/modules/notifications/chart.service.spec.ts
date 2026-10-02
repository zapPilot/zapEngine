import { CHART_CONFIG } from '../../../../src/common/constants';
import { ServiceLayerException } from '../../../../src/common/exceptions';
import { ChartService } from '../../../../src/modules/notifications/chart.service';

interface RequestedChart {
  type: string;
  data: {
    labels: string[];
    datasets: {
      label: string;
      data: number[];
      backgroundColor: string | string[];
    }[];
  };
  options: {
    plugins: { title: { text: string } };
    scales: { y: { min: number; max: number } };
  };
}

function requestedChart(): RequestedChart {
  const fetchMock = vi.mocked(global.fetch);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url] = fetchMock.mock.calls[0]!;
  const requestUrl = new URL(String(url));
  expect(requestUrl.origin + requestUrl.pathname).toBe(
    CHART_CONFIG.QUICKCHART_URL,
  );
  return JSON.parse(requestUrl.searchParams.get('c')!) as RequestedChart;
}

describe('ChartService', () => {
  let service: ChartService;

  beforeEach(() => {
    service = new ChartService();
    vi.stubEnv('TZ', 'UTC');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('generateChart', () => {
    it('generates chart from data points', async () => {
      const mockBuffer = Buffer.from('PNG');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              mockBuffer.buffer.slice(
                mockBuffer.byteOffset,
                mockBuffer.byteOffset + mockBuffer.byteLength,
              ),
            ),
        }),
      );

      const result = await service.generateChart({
        data: [
          { date: '2025-01-01', usd_value: 1000 },
          { date: '2025-01-02', usd_value: 1100 },
        ],
        title: 'Test Chart',
        yField: 'usd_value',
      });

      expect(result.fileName).toContain('chart-');
      expect(result.contentId).toContain('chart-');
      expect(result.buffer).toEqual(mockBuffer);
      expect(requestedChart()).toMatchObject({
        type: 'line',
        data: {
          labels: ['1/2', '1/1'],
          datasets: [{ label: 'usd_value', data: [1100, 1000] }],
        },
        options: {
          plugins: { title: { text: 'Test Chart' } },
          scales: { y: { min: 1000, max: 1100 } },
        },
      });
    });

    it('throws ServiceLayerException on fetch failure', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 500,
        }),
      );

      await expect(
        service.generateChart({
          data: [{ date: '2025-01-01', usd_value: 100 }],
          title: 'Test',
          yField: 'usd_value',
        }),
      ).rejects.toThrow(ServiceLayerException);
    });

    it('throws ServiceLayerException with undefined cause on non-Error rejection', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue('boom-string'));

      try {
        await service.generateChart({
          data: [{ date: '2025-01-01', usd_value: 100 }],
          title: 'Test',
          yField: 'usd_value',
        });
        expect.unreachable('expected generateChart to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceLayerException);
        expect((error as ServiceLayerException).cause).toBeUndefined();
        expect((error as Error).message).toContain('boom-string');
      }
    });
  });

  describe('generateHistoricalBalanceChart', () => {
    it('delegates to generateChart with correct options', async () => {
      const mockBuffer = Buffer.from('PNG');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              mockBuffer.buffer.slice(
                mockBuffer.byteOffset,
                mockBuffer.byteOffset + mockBuffer.byteLength,
              ),
            ),
        }),
      );

      const result = await service.generateHistoricalBalanceChart([
        { date: '2025-01-01', usd_value: 500 },
      ]);

      expect(result.buffer).toEqual(mockBuffer);
      expect(requestedChart()).toMatchObject({
        type: 'line',
        data: {
          labels: ['1/1'],
          datasets: [{ label: 'usd_value', data: [500] }],
        },
        options: {
          plugins: { title: { text: 'Historical Portfolio Balance' } },
        },
      });
    });
  });

  describe('generateChart date label formatting', () => {
    async function generateWithDate(dateValue: unknown) {
      const mockBuffer = Buffer.from('PNG');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              mockBuffer.buffer.slice(
                mockBuffer.byteOffset,
                mockBuffer.byteOffset + mockBuffer.byteLength,
              ),
            ),
        }),
      );
      return service.generateChart({
        data: [{ date: dateValue as string, usd_value: 100 }],
        title: 'Test',
        yField: 'usd_value',
      });
    }

    it('parses Date(year,month,day) string format', async () => {
      const result = await generateWithDate('Date(2025,0,15)');
      expect(result.buffer).toEqual(Buffer.from('PNG'));
      expect(requestedChart().data.labels).toEqual(['1/15']);
    });

    it('parses Date object', async () => {
      const result = await generateWithDate(new Date('2025-01-15'));
      expect(result.buffer).toEqual(Buffer.from('PNG'));
      expect(requestedChart().data.labels).toEqual(['1/15']);
    });

    it('parses numeric timestamp', async () => {
      const result = await generateWithDate(Date.UTC(2025, 0, 15));
      expect(result.buffer).toEqual(Buffer.from('PNG'));
      expect(requestedChart().data.labels).toEqual(['1/15']);
    });

    it('returns "Invalid date" for unrecognized type', async () => {
      // Object type hits the else branch and returns "Invalid date"
      const result = await generateWithDate({ notADate: true });
      expect(result.buffer).toEqual(Buffer.from('PNG'));
      expect(requestedChart().data.labels).toEqual(['Invalid date']);
    });

    it('returns "Invalid date" for NaN date', async () => {
      const result = await generateWithDate('not-a-valid-date-string');
      expect(result.buffer).toEqual(Buffer.from('PNG'));
      expect(requestedChart().data.labels).toEqual(['Invalid date']);
    });
  });

  describe('generateChart with many data points (sampling)', () => {
    it('samples data when count exceeds maxPoints', async () => {
      const mockBuffer = Buffer.from('PNG');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              mockBuffer.buffer.slice(
                mockBuffer.byteOffset,
                mockBuffer.byteOffset + mockBuffer.byteLength,
              ),
            ),
        }),
      );

      // Generate > MAX_DATA_POINTS entries (250 is the configured limit)
      const data = Array.from({ length: 300 }, (_, i) => ({
        date: new Date(Date.now() - i * 86400000).toISOString(),
        usd_value: 1000 + i,
      }));

      const result = await service.generateChart({
        data,
        title: 'Sampled Chart',
        yField: 'usd_value',
      });

      expect(result.buffer).toEqual(mockBuffer);
      const chart = requestedChart();
      expect(chart.data.labels).toHaveLength(CHART_CONFIG.MAX_DATA_POINTS);
      expect(chart.data.datasets[0]!.data).toEqual(
        Array.from(
          { length: CHART_CONFIG.MAX_DATA_POINTS },
          (_, index) => 1299 - index,
        ),
      );
    });
  });

  describe('generateChart with address prefix', () => {
    it('uses address prefix in filename and contentId when address is provided', async () => {
      const mockBuffer = Buffer.from('PNG');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              mockBuffer.buffer.slice(
                mockBuffer.byteOffset,
                mockBuffer.byteOffset + mockBuffer.byteLength,
              ),
            ),
        }),
      );

      const result = await service.generateChart({
        data: [
          { date: '2025-01-01', usd_value: 1000 },
          { date: '2025-01-02', usd_value: 1100 },
        ],
        title: 'Test Chart',
        yField: 'usd_value',
        address: '0x1234567890abcdef12345678',
      });

      expect(result.fileName).toContain('chart-0x123456');
      expect(result.contentId).toBe('chart-0x123456');
    });
  });

  describe('generateChart column type', () => {
    it('uses bar chart type when chartType is column', async () => {
      const mockBuffer = Buffer.from('PNG');
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          arrayBuffer: () =>
            Promise.resolve(
              mockBuffer.buffer.slice(
                mockBuffer.byteOffset,
                mockBuffer.byteOffset + mockBuffer.byteLength,
              ),
            ),
        }),
      );

      const result = await service.generateChart({
        data: [
          { date: '2025-01-01', usd_value: 100 },
          { date: '2025-01-02', usd_value: -50 },
        ],
        title: 'Column Chart',
        yField: 'usd_value',
        chartType: 'column',
      });

      expect(result.buffer).toEqual(mockBuffer);
      expect(requestedChart()).toMatchObject({
        type: 'bar',
        data: {
          datasets: [
            {
              data: [-50, 100],
              backgroundColor: [
                CHART_CONFIG.NEGATIVE_COLOR,
                CHART_CONFIG.PRIMARY_COLOR,
              ],
            },
          ],
        },
      });
    });
  });
});
