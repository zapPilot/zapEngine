export type {
  BacktestDefaults,
  DailySuggestionAction,
  DailySuggestionActionStatus,
  DailySuggestionContext,
  DailySuggestionPortfolio,
  DailySuggestionResponse,
  DailySuggestionStrategyContext,
  DailySuggestionTarget,
  StrategyConfigsResponse,
  StrategyPreset,
} from '@zapengine/types/strategy';

export type RegimeLabel =
  | 'extreme_fear'
  | 'fear'
  | 'neutral'
  | 'greed'
  | 'extreme_greed';
