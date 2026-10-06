import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategyCalculator } from '@/components/verifiable-strategy/StrategyCalculator';

export const metadata: Metadata = {
  title: 'On-chain Strategy Calculator — Research Slice | Zap Pilot',
  description:
    'Verify a single DMA cross-down exit with a research Vyper slice on Arbitrum Sepolia. One of six rules, not the production strategy.',
};

export default function CalculatorPage() {
  return (
    <Suspense
      fallback={
        <div>
          <span className="pending-badge">
            Research slice · 1 of 6 rules · Not production
          </span>
          <p>Loading research strategy calculator…</p>
        </div>
      }
    >
      <StrategyCalculator />
    </Suspense>
  );
}
