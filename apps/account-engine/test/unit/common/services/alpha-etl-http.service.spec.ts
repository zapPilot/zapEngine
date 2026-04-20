import { ServiceLayerException } from '@common/exceptions';
import { AlphaEtlHttpService } from '@common/services/alpha-etl-http.service';
import { createMockConfigService } from '@test-utils';

describe('AlphaEtlHttpService', () => {
  let service: AlphaEtlHttpService;

  beforeEach(() => {
    service = new AlphaEtlHttpService(createMockConfigService());
    vi.restoreAllMocks();
  });

  describe('healthPing', () => {
    it('returns true when health check passes', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      const result = await service.healthPing();
      expect(result).toBe(true);
    });

    it('returns false when health check returns non-ok', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
      });

      const result = await service.healthPing();
      expect(result).toBe(false);
    });

    it('retries once on first failure then returns result', async () => {
      const fetchMock = vi
        .fn()
        .mockRejectedValueOnce(new Error('ECONNREFUSED'))
        .mockResolvedValueOnce({ ok: true });
      global.fetch = fetchMock;

      const result = await service.healthPing();
      expect(result).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('returns false when both attempts fail', async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      const result = await service.healthPing();
      expect(result).toBe(false);
    });
  });

  describe('triggerWalletFetch', () => {
    it('returns jobId on success', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, data: { jobId: 'j-1' } }),
      });

      const result = await service.triggerWalletFetch('u-1', '0x1234');
      expect(result.jobId).toBe('j-1');
    });

    it('throws ServiceLayerException on non-ok response', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        text: () => Promise.resolve('Bad Gateway'),
      });

      await expect(service.triggerWalletFetch('u-1', '0x1234')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws ServiceLayerException when response has no jobId', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: false }),
      });

      await expect(service.triggerWalletFetch('u-1', '0x1234')).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });

  describe('getJobStatus', () => {
    it('returns validated job status', async () => {
      const jobData = {
        jobId: 'j-1',
        status: 'completed',
        walletAddress: '0x1234',
        userId: 'u-1',
        trigger: 'webhook',
        createdAt: '2025-01-01T00:00:00Z',
        updatedAt: '2025-01-01T00:01:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: jobData }),
      });

      const result = await service.getJobStatus('j-1');
      expect(result.jobId).toBe('j-1');
      expect(result.status).toBe('completed');
    });

    it('throws NOT_FOUND for 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(service.getJobStatus('bad')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws BAD_GATEWAY for non-ok status', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal error'),
      });

      await expect(service.getJobStatus('j-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });

    it('throws when response is not successful', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({ success: false, error: 'Processing failed' }),
      });

      await expect(service.getJobStatus('j-1')).rejects.toThrow(
        ServiceLayerException,
      );
    });
  });
});
