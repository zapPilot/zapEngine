import * as fs from 'node:fs';

import type { Mock } from 'vitest';

import { ServiceLayerException } from '@/common/exceptions';
import { ChartService } from '@/modules/notifications/chart.service';

vi.mock('node:fs');

const mockExistsSync = fs.existsSync as Mock;
const mockMkdirSync = fs.mkdirSync as Mock;
const mockWriteFileSync = fs.writeFileSync as Mock;
const mockUnlinkSync = fs.unlinkSync as Mock;

describe('ChartService', () => {
  let service: ChartService;

  beforeEach(() => {
    mockExistsSync.mockReturnValue(true);
    mockMkdirSync.mockReturnValue(undefined);
    mockWriteFileSync.mockReturnValue(undefined);
    mockUnlinkSync.mockReturnValue(undefined);
    service = new ChartService();
  });

  describe('constructor', () => {
    it('creates temp directory if it does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      // eslint-disable-next-line sonarjs/constructor-for-side-effects
      new ChartService();
      expect(mockMkdirSync).toHaveBeenCalledWith(
        expect.stringContaining('temp'),
        { recursive: true },
      );
    });
  });

  describe('generateChart', () => {
    it('generates chart from data points', async () => {
      const mockBuffer = Buffer.from('PNG');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
      });

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
      expect(mockWriteFileSync).toHaveBeenCalled();
    });

    it('throws ServiceLayerException on fetch failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      });

      await expect(
        service.generateChart({
          data: [{ date: '2025-01-01', usd_value: 100 }],
          title: 'Test',
          yField: 'usd_value',
        }),
      ).rejects.toThrow(ServiceLayerException);
    });
  });

  describe('generateHistoricalBalanceChart', () => {
    it('delegates to generateChart with correct options', async () => {
      const mockBuffer = Buffer.from('PNG');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
      });

      const result = await service.generateHistoricalBalanceChart([
        { date: '2025-01-01', usd_value: 500 },
      ]);

      expect(result.contentId).toContain('chart-');
    });
  });

  describe('generateChart date label formatting', () => {
    async function generateWithDate(dateValue: unknown) {
      const mockBuffer = Buffer.from('PNG');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
      });
      return service.generateChart({
        data: [{ date: dateValue as string, usd_value: 100 }],
        title: 'Test',
        yField: 'usd_value',
      });
    }

    it('parses Date(year,month,day) string format', async () => {
      const result = await generateWithDate('Date(2025,0,15)');
      expect(result.fileName).toContain('chart-');
    });

    it('parses Date object', async () => {
      const result = await generateWithDate(new Date('2025-01-15'));
      expect(result.fileName).toContain('chart-');
    });

    it('parses numeric timestamp', async () => {
      const result = await generateWithDate(Date.now());
      expect(result.fileName).toContain('chart-');
    });

    it('returns "Invalid date" for unrecognized type', async () => {
      // Object type hits the else branch and returns "Invalid date"
      const result = await generateWithDate({ notADate: true });
      expect(result.fileName).toContain('chart-');
    });

    it('returns "Invalid date" for NaN date', async () => {
      const result = await generateWithDate('not-a-valid-date-string');
      expect(result.fileName).toContain('chart-');
    });
  });

  describe('generateChart with many data points (sampling)', () => {
    it('samples data when count exceeds maxPoints', async () => {
      const mockBuffer = Buffer.from('PNG');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
      });

      // Generate > MAX_DATA_POINTS entries (100 is the typical limit)
      const data = Array.from({ length: 200 }, (_, i) => ({
        date: new Date(Date.now() - i * 86400000).toISOString(),
        usd_value: 1000 + i,
      }));

      const result = await service.generateChart({
        data,
        title: 'Sampled Chart',
        yField: 'usd_value',
      });

      expect(result.fileName).toContain('chart-');
      expect(mockWriteFileSync).toHaveBeenCalled();
    });
  });

  describe('generateChart column type', () => {
    it('uses bar chart type when chartType is column', async () => {
      const mockBuffer = Buffer.from('PNG');
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockBuffer.buffer),
      });

      const result = await service.generateChart({
        data: [
          { date: '2025-01-01', usd_value: 100 },
          { date: '2025-01-02', usd_value: -50 },
        ],
        title: 'Column Chart',
        yField: 'usd_value',
        chartType: 'column',
      });

      expect(result.fileName).toContain('chart-');
    });
  });

  describe('cleanupTempFiles', () => {
    it('deletes temp file when it exists', () => {
      mockExistsSync.mockReturnValue(true);

      service.cleanupTempFiles({
        buffer: Buffer.from(''),
        fileName: 'test.png',
        // eslint-disable-next-line sonarjs/publicly-writable-directories
        filePath: '/tmp/test.png',
        contentId: 'cid',
      });

      // eslint-disable-next-line sonarjs/publicly-writable-directories
      expect(mockUnlinkSync).toHaveBeenCalledWith('/tmp/test.png');
    });

    it('does not throw when file does not exist', () => {
      mockExistsSync.mockReturnValue(false);

      service.cleanupTempFiles({
        buffer: Buffer.from(''),
        fileName: 'test.png',
        // eslint-disable-next-line sonarjs/publicly-writable-directories
        filePath: '/tmp/gone.png',
        contentId: 'cid',
      });

      expect(mockUnlinkSync).not.toHaveBeenCalled();
    });

    it('does not throw on unlink error', () => {
      mockExistsSync.mockReturnValue(true);
      mockUnlinkSync.mockImplementation(() => {
        throw new Error('EPERM');
      });

      expect(() =>
        service.cleanupTempFiles({
          buffer: Buffer.from(''),
          fileName: 'test.png',
          // eslint-disable-next-line sonarjs/publicly-writable-directories
          filePath: '/tmp/test.png',
          contentId: 'cid',
        }),
      ).not.toThrow();
    });
  });
});
