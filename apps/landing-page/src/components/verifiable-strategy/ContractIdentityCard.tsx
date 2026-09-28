import { useState } from 'react';
import { explorerUrl, sourcifyUrl } from '@/config/verifiable-strategy';
import type { Dataset } from '@/lib/verifiable-strategy/types';
export function ContractIdentityCard({
  data,
  verification,
}: {
  data: Dataset;
  verification: string;
}) {
  const [copied, setCopied] = useState('Copy codehash');
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.runtimeCodehash);
      setCopied('Copied');
    } catch {
      setCopied('Select codehash to copy');
    }
  }
  return (
    <section
      className="track-record-calculator-identity"
      aria-label="Contract identity"
    >
      <strong>Contract</strong>
      <span>Arbitrum Sepolia</span>
      {data.deployment ? (
        <a href={explorerUrl(data.deployment.address)}>
          {data.deployment.address}
        </a>
      ) : (
        <span>Not deployed yet</span>
      )}
      <span>
        Codehash{' '}
        <code title={data.runtimeCodehash}>{data.runtimeCodehash}</code>
      </span>
      <button type="button" onClick={() => void copy()}>
        {copied}
      </button>
      <a href={data.sourceUrl} target="_blank" rel="noreferrer">
        Source ↗
      </a>
      {data.deployment && (
        <>
          <a href={sourcifyUrl(data.deployment.address)}>
            Sourcify ({data.deployment.sourcify.status}) ↗
          </a>
          <span role="status">{verification}</span>
        </>
      )}
    </section>
  );
}
