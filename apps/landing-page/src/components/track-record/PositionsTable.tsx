import type { DailySnapshot } from '@zapengine/types/strategy';

interface PositionsTableProps {
  positions: DailySnapshot['positions'];
  className?: string;
}

export function PositionsTable({ positions, className }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className={`positions-table-empty ${className ?? ''}`}>
        <p>No positions available.</p>
      </div>
    );
  }

  return (
    <div className={`positions-table-wrap ${className ?? ''}`}>
      <table className="positions-table">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Protocol</th>
            <th>Chain</th>
            <th>Weight</th>
            <th>Value USD</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          {positions.map((pos, i) => (
            <tr key={i}>
              <td className="td-asset">
                <span className="asset-name">{pos.asset}</span>
                {pos.tokenAddress && (
                  <span className="asset-token">
                    {pos.tokenAddress.slice(0, 8)}…
                  </span>
                )}
              </td>
              <td>{pos.protocol}</td>
              <td className="td-chain">{pos.chainId}</td>
              <td className="td-pct">{pos.weight}</td>
              <td className="td-usd">${pos.valueUsd}</td>
              <td className="td-amount">{pos.amount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
