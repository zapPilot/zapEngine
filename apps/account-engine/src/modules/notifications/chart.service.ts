import * as fs from 'node:fs';
import * as path from 'node:path';

import { CHART_CONFIG } from '../../common/constants';
import { ServiceLayerException } from '../../common/exceptions';
import { Logger } from '../../common/logger';
import { getErrorMessage } from '../../common/utils';

export interface ChartDataPoint {
  date: string | Date;
  usd_value: number;
}

export interface ChartResult {
  buffer: Buffer;
  fileName: string;
  filePath: string;
  contentId: string;
}

export interface GenerateChartOptions {
  data: ChartDataPoint[];
  title: string;
  xField?: string;
  yField: string;
  address?: string;
  chartType?: 'line' | 'column';
}

export class ChartService {
  private readonly logger = new Logger(ChartService.name);
  private readonly tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp');
    this.ensureTempDirectory();
  }

  private ensureTempDirectory(): void {
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Sample data points to limit chart API payload size
   */
  private sampleDataPoints<T>(data: T[], maxPoints: number): T[] {
    if (data.length <= maxPoints) {
      return data;
    }

    const step = Math.floor(data.length / maxPoints);
    const sampled = data
      .filter((_, index) => index % step === 0)
      .slice(0, maxPoints);

    this.logger.log(
      `Sampled ${data.length} data points down to ${sampled.length} for chart generation`,
    );

    return sampled;
  }

  /**
   * Format date value for chart x-axis label
   */
  private formatDateLabel(dateValue: unknown): string {
    let date: Date;

    // Handle date format 'Date(2025,0,3)'
    if (typeof dateValue === 'string' && dateValue.startsWith('Date(')) {
      const dateComponents = dateValue
        .substring(5, dateValue.length - 1)
        .split(',')
        .map(Number);
      date = new Date(
        dateComponents[0] ?? 0,
        dateComponents[1] ?? 0,
        dateComponents[2] ?? 0,
      );
    } else if (dateValue instanceof Date) {
      date = new Date(dateValue.getTime());
    } else if (typeof dateValue === 'number' || typeof dateValue === 'string') {
      date = new Date(dateValue);
    } else {
      this.logger.error('Invalid date value type', { value: dateValue });
      return 'Invalid date';
    }

    if (Number.isNaN(date.getTime())) {
      this.logger.error('Invalid date value', { value: dateValue });
      return 'Invalid date';
    }

    return `${date.getMonth() + 1}/${date.getDate()}`;
  }

  /**
   * Build Chart.js configuration object
   */
  private buildChartConfig(
    labels: string[],
    values: number[],
    yField: string,
    title: string,
    chartType: 'line' | 'bar',
  ): Record<string, unknown> {
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);

    return {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: yField,
            data: values,
            fill: false,
            borderColor: CHART_CONFIG.PRIMARY_COLOR,
            backgroundColor:
              chartType === 'line'
                ? CHART_CONFIG.PRIMARY_COLOR
                : values.map((value) =>
                    value >= 0
                      ? CHART_CONFIG.PRIMARY_COLOR
                      : CHART_CONFIG.NEGATIVE_COLOR,
                  ),
            tension: 0.4,
            borderWidth: chartType === 'line' ? 2 : 0,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          title: {
            display: true,
            text: title,
            color: '#ffffff',
            font: { size: 16, weight: 'bold' },
          },
          legend: { display: false },
        },
        scales: {
          x: {
            title: { display: true, text: 'Date', color: '#ffffff' },
            ticks: { color: '#ffffff', maxTicksLimit: 5 },
            grid: { color: 'rgba(48, 48, 48, 0.5)' },
          },
          y: {
            title: { display: true, text: yField, color: '#ffffff' },
            min: minValue,
            max: maxValue,
            ticks: { color: '#ffffff' },
            grid: {
              color: 'rgba(48, 48, 48, 0.5)',
              lineWidth: 1,
              borderDash: [4, 5],
            },
          },
        },
      },
    };
  }

  async generateChart(options: GenerateChartOptions): Promise<ChartResult> {
    const {
      data,
      title,
      xField = 'date',
      yField,
      address,
      chartType = 'line',
    } = options;

    // Reverse and sample data
    const reversedData = [...data].reverse();
    const sampledData = this.sampleDataPoints(
      reversedData,
      CHART_CONFIG.MAX_DATA_POINTS,
    );

    // Format labels and prepare values
    const labels = sampledData.map((item) =>
      this.formatDateLabel(
        (item as unknown as Record<string, unknown>)[xField],
      ),
    );
    const values = sampledData.map((item) =>
      Number((item as unknown as Record<string, unknown>)[yField]),
    );

    // Build chart configuration (convert 'column' to 'bar' for Chart.js)
    const chartJsType = chartType === 'line' ? 'line' : 'bar';
    const chartConfig = this.buildChartConfig(
      labels,
      values,
      yField,
      title,
      chartJsType,
    );

    // Generate filename
    const addressPrefix = address ? address.substring(0, 8) : 'default';
    const fileName = `chart-${addressPrefix}-${Date.now()}.png`;
    const filePath = path.join(this.tempDir, fileName);

    try {
      // Use QuickChart API to generate the chart
      const chartUrl = new URL('https://quickchart.io/chart');
      chartUrl.searchParams.set('c', JSON.stringify(chartConfig));
      chartUrl.searchParams.set(
        'backgroundColor',
        CHART_CONFIG.BACKGROUND_COLOR,
      );

      const response = await fetch(chartUrl.toString());
      if (!response.ok) {
        throw new Error(
          `QuickChart request failed with status ${response.status}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Save the image to file
      fs.writeFileSync(filePath, buffer);

      return {
        buffer,
        fileName,
        filePath,
        contentId: `chart-${addressPrefix}`,
      };
    } catch (error) {
      this.logger.error('Error generating chart:', error);
      throw new ServiceLayerException(
        `Failed to generate chart: ${getErrorMessage(error)}`,
        undefined,
        error instanceof Error ? error : undefined,
      );
    }
  }

  async generateHistoricalBalanceChart(
    balanceData: ChartDataPoint[],
  ): Promise<ChartResult> {
    return this.generateChart({
      data: balanceData,
      title: 'Historical Portfolio Balance',
      xField: 'date',
      yField: 'usd_value',
      chartType: 'line',
    });
  }

  cleanupTempFiles(chartResult: ChartResult): void {
    if (chartResult.filePath && fs.existsSync(chartResult.filePath)) {
      try {
        fs.unlinkSync(chartResult.filePath);
        this.logger.log(`Cleaned up temp file: ${chartResult.fileName}`);
      } catch (error) {
        this.logger.error('Failed to cleanup temp file:', error);
      }
    }
  }
}
