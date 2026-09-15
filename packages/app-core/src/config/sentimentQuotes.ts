/**
 * Wisdom quotes mapped to market sentiment ranges.
 *
 * Provides quick investment heuristics for the Market Sentiment widget.
 * The helper returns a deterministic quote based on the sentiment score
 * so users see stable messaging across refreshes.
 */

export type SentimentLabel =
  | 'Extreme Fear'
  | 'Fear'
  | 'Neutral'
  | 'Greed'
  | 'Extreme Greed';

const WARREN_BUFFETT = 'Warren Buffett';

interface SentimentQuote {
  quote: string;
  author: string;
}

interface SentimentQuoteConfig {
  min: number;
  max: number;
  sentiment: SentimentLabel;
  quotes: [SentimentQuote, ...SentimentQuote[]];
}

interface SentimentQuoteResult extends SentimentQuote {
  sentiment: SentimentLabel;
}

const SENTIMENT_QUOTE_CONFIG: SentimentQuoteConfig[] = [
  {
    min: 0,
    max: 24,
    sentiment: 'Extreme Fear',
    quotes: [
      {
        quote: 'Be greedy when others are fearful.',
        author: WARREN_BUFFETT,
      },
      {
        quote:
          'Opportunities come infrequently. When it rains gold, put out the bucket.',
        author: WARREN_BUFFETT,
      },
    ],
  },
  {
    min: 25,
    max: 44,
    sentiment: 'Fear',
    quotes: [
      {
        quote: 'Investing is most intelligent when it is most businesslike.',
        author: 'Benjamin Graham',
      },
      {
        quote:
          'The intelligent investor is a realist who sells to optimists and buys from pessimists.',
        author: 'Benjamin Graham',
      },
    ],
  },
  {
    min: 45,
    max: 55,
    sentiment: 'Neutral',
    quotes: [
      {
        quote: 'Diversification is protection against ignorance.',
        author: WARREN_BUFFETT,
      },
      {
        quote: 'In investing, what is comfortable is rarely profitable.',
        author: 'Robert Arnott',
      },
    ],
  },
  {
    min: 56,
    max: 74,
    sentiment: 'Greed',
    quotes: [
      {
        quote: 'Bull markets are born on pessimism and die on euphoria.',
        author: 'Sir John Templeton',
      },
      {
        quote: 'The time to get interested is when no one else is.',
        author: 'Mark Mobius',
      },
    ],
  },
  {
    min: 75,
    max: 100,
    sentiment: 'Extreme Greed',
    quotes: [
      {
        quote:
          "The four most dangerous words in investing are: this time it's different.",
        author: 'Sir John Templeton',
      },
      {
        quote: "Risk comes from not knowing what you're doing.",
        author: WARREN_BUFFETT,
      },
    ],
  },
];

const DEFAULT_QUOTE: SentimentQuoteResult = {
  sentiment: 'Neutral',
  quote: 'Stay balanced when the crowd swings too far in either direction.',
  author: WARREN_BUFFETT,
};

function selectQuote(quotes: SentimentQuoteConfig['quotes']): SentimentQuote {
  const index = Math.floor(Math.random() * quotes.length);
  return (
    quotes[index] ?? {
      quote: DEFAULT_QUOTE.quote,
      author: DEFAULT_QUOTE.author,
    }
  );
}

/**
 * Get a quote for a given sentiment score (0-100).
 */
export function getQuoteForSentiment(value: number): SentimentQuoteResult {
  if (!Number.isFinite(value)) {
    return DEFAULT_QUOTE;
  }

  const normalizedValue = Math.min(Math.max(value, 0), 100);
  const configIndex =
    normalizedValue < 25
      ? 0
      : normalizedValue < 45
        ? 1
        : normalizedValue <= 55
          ? 2
          : normalizedValue < 75
            ? 3
            : 4;
  const config = SENTIMENT_QUOTE_CONFIG[configIndex];
  if (config === undefined) {
    return DEFAULT_QUOTE;
  }

  const quote = selectQuote(config.quotes);

  return {
    sentiment: config.sentiment,
    quote: quote.quote,
    author: quote.author,
  };
}
