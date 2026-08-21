import { TRACK_RECORD_CONFIG } from '../../../../src/common/constants';
import { ServiceLayerException } from '../../../../src/common/exceptions';
import { TrackRecordCurveService } from '../../../../src/modules/notifications/track-record/client';
import {
  createEquityCurveFixture,
  createMockConfigService,
} from '../../../test-utils';

function createService(env: Record<string, unknown> = {}) {
  return new TrackRecordCurveService(createMockConfigService(env));
}

function mockOkResponse(payload: unknown) {
  return { ok: true, json: () => Promise.resolve(payload) };
}

describe('TrackRecordCurveService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads the committed artifact from the default raw URL', async () => {
    const curve = createEquityCurveFixture();
    global.fetch = vi.fn().mockResolvedValue(mockOkResponse(curve));

    await expect(createService().fetchCurve()).resolves.toEqual(curve);
    expect(global.fetch).toHaveBeenCalledWith(
      TRACK_RECORD_CONFIG.EQUITY_CURVE_URL_DEFAULT,
      expect.objectContaining({ headers: { Accept: 'application/json' } }),
    );
  });

  it('honours a configured URL override', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(mockOkResponse(createEquityCurveFixture()));

    await createService({
      TRACK_RECORD_EQUITY_CURVE_URL: 'http://localhost:9999/curve.json',
    }).fetchCurve();

    expect(global.fetch).toHaveBeenCalledWith(
      'http://localhost:9999/curve.json',
      expect.any(Object),
    );
  });

  it('fails with a bad-gateway error on a non-OK response', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

    await expect(createService().fetchCurve()).rejects.toThrow(
      'Equity curve request failed with status 404',
    );
  });

  describe('artifact validation', () => {
    it.each([
      [
        'a missing events array',
        (curve: ReturnType<typeof createEquityCurveFixture>) => ({
          ...curve,
          events: undefined,
        }),
      ],
      [
        'a reordered allocation header',
        (curve: ReturnType<typeof createEquityCurveFixture>) => ({
          ...curve,
          allocations: {
            ...curve.allocations,
            assets: ['eth', 'btc', 'spy', 'stable'],
          },
        }),
      ],
      [
        'allocation rows that do not line up with the series',
        (curve: ReturnType<typeof createEquityCurveFixture>) => ({
          ...curve,
          allocations: {
            ...curve.allocations,
            values: curve.allocations.values.slice(0, 2),
          },
        }),
      ],
      [
        'a weight outside 0..1',
        (curve: ReturnType<typeof createEquityCurveFixture>) => ({
          ...curve,
          allocations: {
            ...curve.allocations,
            values: [
              [0, 0, 0, 1],
              [0.5, 0, 0, 0.5],
              [2, 0, 0, -1],
            ],
          },
        }),
      ],
      [
        'a non-ISO window end',
        (curve: ReturnType<typeof createEquityCurveFixture>) => ({
          ...curve,
          window: { end: '03/01/2026' },
        }),
      ],
    ])('rejects %s', async (_label, mutate) => {
      global.fetch = vi
        .fn()
        .mockResolvedValue(mockOkResponse(mutate(createEquityCurveFixture())));

      await expect(createService().fetchCurve()).rejects.toThrow(
        /Unexpected equity curve shape/,
      );
    });

    it('reports a top-level type mismatch as the root path', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockOkResponse('not-an-object'));

      await expect(createService().fetchCurve()).rejects.toThrow(
        /Unexpected equity curve shape: root/,
      );
    });

    it('reports the failing path so a drifted artifact is diagnosable', async () => {
      global.fetch = vi.fn().mockResolvedValue(
        mockOkResponse({
          ...createEquityCurveFixture(),
          eventsMeta: { strategyId: '' },
        }),
      );

      await expect(createService().fetchCurve()).rejects.toThrow(
        /eventsMeta.strategyId/,
      );
    });
  });

  describe('timeouts', () => {
    it('retries once and succeeds on the second attempt', async () => {
      global.fetch = vi
        .fn()
        .mockRejectedValueOnce(
          new Error('The operation was aborted due to timeout'),
        )
        .mockResolvedValueOnce(mockOkResponse(createEquityCurveFixture()));

      await expect(createService().fetchCurve()).resolves.toBeDefined();
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('gives up after the retry also times out', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('timed out'));

      await expect(createService().fetchCurve()).rejects.toThrow(
        ServiceLayerException,
      );
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry a non-timeout transport failure', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(createService().fetchCurve()).rejects.toThrow(
        /Failed to fetch equity curve/,
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('does not retry a rejected artifact', async () => {
      global.fetch = vi.fn().mockResolvedValue(mockOkResponse({}));

      await expect(createService().fetchCurve()).rejects.toThrow(
        ServiceLayerException,
      );
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });
});
