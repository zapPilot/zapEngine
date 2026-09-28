import { explorerUrl, sourcifyUrl } from '@/config/verifiable-strategy';
import type { Dataset } from '@/lib/verifiable-strategy/types';

export function ContractIdentityCard({
  data,
  verification,
}: {
  data: Dataset;
  verification: string;
}) {
  const deployment = data.deployment;
  return (
    <section
      className="track-record-calculator-card"
      aria-label="Contract identity"
    >
      <span className="pending-badge">
        Research slice · 1 of 6 rules · Not production
      </span>
      <h2>DMA cross-down exit</h2>
      <p>
        Arbitrum Sepolia · cross_down_exit only · Vyper {data.compiler} ·{' '}
        {data.evmVersion}
      </p>
      <dl>
        <dt>Runtime codehash</dt>
        <dd>
          <code>{data.runtimeCodehash}</code>
        </dd>
        <dt>Deployment</dt>
        <dd>
          {deployment ? (
            <>
              <a
                href={explorerUrl(deployment.address)}
                target="_blank"
                rel="noreferrer"
              >
                {deployment.address}
              </a>
              <br />
              Block {deployment.blockNumber} ·{' '}
              <a
                href={`https://sepolia.arbiscan.io/tx/${deployment.transactionHash}`}
                target="_blank"
                rel="noreferrer"
              >
                Deployment transaction
              </a>
            </>
          ) : (
            'Not deployed yet'
          )}
        </dd>
        <dt>Bytecode check</dt>
        <dd role="status">{verification}</dd>
      </dl>
      <p>
        <a href={data.sourceUrl} target="_blank" rel="noreferrer">
          Pinned Vyper source ↗
        </a>
        {deployment && (
          <>
            {' '}
            ·{' '}
            <a
              href={sourcifyUrl(deployment.address)}
              target="_blank"
              rel="noreferrer"
            >
              Sourcify ({deployment.sourcify.status}) ↗
            </a>
          </>
        )}
      </p>
    </section>
  );
}
