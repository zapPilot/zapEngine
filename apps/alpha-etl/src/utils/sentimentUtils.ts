/**
 * Sentiment data normalization utilities
 * Provides reusable functions for sentiment classification normalization
 */

/**
 * Valid sentiment classifications
 * This avoids circular dependencies between schemas and utilities
 */
export const SENTIMENT_CLASSIFICATIONS = [
  "Extreme Fear",
  "Fear",
  "Neutral",
  "Greed",
  "Extreme Greed",
] as const;

function findMatchingClassification(
  input: string,
): (typeof SENTIMENT_CLASSIFICATIONS)[number] | undefined {
  const normalized = input.toLowerCase().trim();
  return SENTIMENT_CLASSIFICATIONS.find(
    (option) => option.toLowerCase() === normalized,
  );
}

/**
 * Normalizes sentiment classification strings to match exact enum values
 * Performs case-insensitive matching and returns the original value if no match found
 */
export function normalizeSentimentClassification(input: string): string {
  return findMatchingClassification(input) ?? input;
}

/**
 * Validates if a string matches one of the valid sentiment classifications
 * Uses case-insensitive comparison for flexible validation
 */
export function isValidSentimentClassification(
  classification: string,
): boolean {
  return findMatchingClassification(classification) !== undefined;
}
