import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  setTrackRecordSource,
  useTrackRecordSource,
} from '@/data/track-record-source';

function SourceProbe() {
  return <span data-source>{useTrackRecordSource()}</span>;
}

describe('track record source server snapshot', () => {
  it('always renders the deterministic backtest source during SSR', () => {
    setTrackRecordSource('live');
    try {
      expect(renderToString(<SourceProbe />)).toContain('backtest');
    } finally {
      setTrackRecordSource('backtest');
    }
  });
});
