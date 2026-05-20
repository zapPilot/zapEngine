/**
 * Chart generation configuration constants
 */
export const CHART_CONFIG = {
  MAX_DATA_POINTS: 250,
  BACKGROUND_COLOR: '#141414',
  PRIMARY_COLOR: '#3fb57d',
  NEGATIVE_COLOR: '#ff4d4f',

  /** Foreground color for chart titles, axis labels, and ticks. */
  AXIS_LABEL_COLOR: '#ffffff',

  /** Grid line color for both x and y axes. */
  GRID_COLOR: 'rgba(48, 48, 48, 0.5)',

  /** Dash pattern for the y-axis grid lines (Chart.js borderDash format). */
  Y_GRID_BORDER_DASH: [4, 5] as readonly number[],

  /** Tension factor for line-chart curves (0 = straight, 1 = very curvy). */
  LINE_TENSION: 0.4,

  /** Maximum number of x-axis tick labels to draw. */
  X_AXIS_MAX_TICKS: 5,

  /** QuickChart rendering endpoint. */
  QUICKCHART_URL: 'https://quickchart.io/chart',
} as const;
