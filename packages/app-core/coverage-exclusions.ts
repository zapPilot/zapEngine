export const COVERAGE_EXCLUDED_EMPTY_MODULES = ['src/index.ts'] as const;

export const COVERAGE_EXCLUDED_TYPE_ONLY_MODULES = [
  'src/types/analytics.ts',
  'src/types/backtesting.ts',
  'src/types/domain/transaction.ts',
  'src/types/domain/wallet.ts',
  'src/types/portfolioProgressive.ts',
  'src/types/strategy.ts',
  'src/types/ui/ui.types.ts',
  'src/types/wallet.ts',
] as const;

export const COVERAGE_EXCLUDES = [
  ...COVERAGE_EXCLUDED_EMPTY_MODULES,
  ...COVERAGE_EXCLUDED_TYPE_ONLY_MODULES,
];
