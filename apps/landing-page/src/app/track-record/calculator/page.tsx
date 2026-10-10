import type { Metadata } from 'next';
import { Suspense } from 'react';
import { StrategyCalculator } from '@/components/verifiable-strategy/StrategyCalculator';

export const metadata: Metadata = {
  title: 'On-chain Strategy Calculator — Research Slice | Zap Pilot',
  description:
    'Verify a single DMA cross-down exit with a research Vyper slice on Arbitrum Sepolia. Version 1’s exit rule, not the production strategy.',
};

export default function CalculatorPage() {
  return (
    <Suspense
      fallback={
        <div>
          <span className="pending-badge">
            Research slice · Version 1 exit rule · Not production
          </span>
          <p>Loading research strategy calculator…</p>
        </div>
      }
    >
      <StrategyCalculator />
    </Suspense>
  );
}
