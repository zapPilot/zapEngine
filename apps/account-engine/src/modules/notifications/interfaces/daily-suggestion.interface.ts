import type { DailySuggestionResponse } from '@zapengine/types/strategy';

/**
 * Daily suggestion response consumed from analytics-engine.
 *
 * The canonical contract lives in @zapengine/types/strategy. These aliases keep
 * the account-engine notification layer's existing public names stable.
 */
export type DailySuggestionData = DailySuggestionResponse;
