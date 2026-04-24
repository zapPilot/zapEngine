export { AllocationLegend } from './AllocationLegend';
export { UnifiedAllocationBar } from './UnifiedAllocationBar';

// Type exports
export type {
  AssetAllocationSource,
  BacktestConstituentsSource,
  LegacyAllocationConstituent,
  PortfolioAllocationSource,
  StrategyBucketsSource,
  UnifiedAllocationBarProps,
  UnifiedCategory,
  UnifiedSegment,
} from './UnifiedAllocationTypes';

// Utility exports
export {
  calculateTotalPercentage,
  getAllocationSummary,
  mapAssetAllocationToUnified,
  mapBacktestToUnified,
  mapLegacyConstituentsToUnified,
  mapPortfolioToUnified,
  mapStrategyToUnified,
} from './UnifiedAllocationUtils';
