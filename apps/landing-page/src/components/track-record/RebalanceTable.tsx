import type { DailySnapshot } from '@zapengine/types/strategy';

interface RebalanceTableProps {
  snapshots: DailySnapshot[];
  className?: string;
}

export function RebalanceTable({ snapshots, className }: RebalanceTableProps) {
  const rebalanceSnapshots = snapshots.filter((s) =>
    s.transactions.some((t) => t.type === 'rebalance'),
  );

  if (rebalanceSnapshots.length === 0) {
    return (
      <div className={`rebalance-table-empty ${className ?? ''}`}>
        <p>No rebalances recorded yet.</p>
      </div>
    );
  }

  return (
    <div className={`rebalance-table-wrap ${className ?? ''}`}>
      <table className="rebalance-table">
        <thead>
          <tr>
            <th>Date</th>
            <th>Tx Type</th>
            <th>Chain</th>
            <th>Tx Hash</th>
            <th>Daily Return</th>
            <th>Gas Cost USD</th>
          </tr>
        </thead>
        <tbody>
          {rebalanceSnapshots.map((snap) =>
            snap.transactions
              .filter((t) => t.type === 'rebalance')
              .map((tx, i) => (
                <tr key={`${snap.date}-${i}`}>
                  <td className="td-date">{snap.date}</td>
                  <td className="td-type">Rebalance</td>
                  <td className="td-chain">{tx.chainId}</td>
                  <td className="td-hash">
                    <a
                      href={`https://etherscan.io/tx/${tx.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {tx.hash.slice(0, 10)}…
                    </a>
                  </td>
                  <td className="td-return">{snap.performance.dailyReturn}</td>
                  <td className="td-cost">${snap.costs.gasUsd}</td>
                </tr>
              )),
          )}
        </tbody>
      </table>
    </div>
  );
}
