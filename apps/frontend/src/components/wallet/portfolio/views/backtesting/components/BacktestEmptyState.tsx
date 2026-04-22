import { Zap } from 'lucide-react';

export function BacktestEmptyState() {
  return (
    <div className="h-full min-h-[500px] flex flex-col items-center justify-center bg-gray-900/20 border border-dashed border-gray-800 rounded-2xl p-8 text-center text-gray-500">
      <div className="relative">
        <div className="absolute inset-0 bg-blue-500/20 blur-xl rounded-full" />
        <Zap className="relative w-16 h-16 text-gray-700 mb-6" />
      </div>
      <h3 className="text-xl font-medium text-gray-200 mb-2">
        Ready to Compare Strategies
      </h3>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Click &quot;Run Backtest&quot; to see how the Zap Pilot regime-based
        strategy compares to normal DCA.
      </p>
    </div>
  );
}
