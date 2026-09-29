import { useState } from 'react';
import { explorerUrl, sourcifyUrl } from '@/config/verifiable-strategy';
import type { Dataset } from '@/lib/verifiable-strategy/types';

const shortHex = (value: string) => `${value.slice(0, 10)}…${value.slice(-6)}`;

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
  const deployment = data.deployment;
  return (
    <dl className="calc-identity" aria-label="Contract identity">
      <div>
        <dt>Network</dt>
        <dd>Arbitrum Sepolia</dd>
      </div>
      <div>
        <dt>Address</dt>
        <dd>
          {deployment ? (
            <a
              href={explorerUrl(deployment.address)}
              target="_blank"
              rel="noreferrer"
              title={deployment.address}
            >
              <code>{shortHex(deployment.address)}</code>
            </a>
          ) : (
            <span className="calc-pending">Not deployed yet</span>
          )}
        </dd>
      </div>
      <div>
        <dt>Runtime codehash</dt>
        <dd>
          <code title={data.runtimeCodehash}>
            {shortHex(data.runtimeCodehash)}
          </code>
          <button
            className="calc-link"
            type="button"
            onClick={() => void copy()}
          >
            {copied}
          </button>
        </dd>
      </div>
      <div>
        <dt>Source</dt>
        <dd>
          <a href={data.sourceUrl} target="_blank" rel="noreferrer">
            Vyper {data.compiler} ↗
          </a>
          {deployment && (
            <a
              href={sourcifyUrl(deployment.address)}
              target="_blank"
              rel="noreferrer"
            >
              Sourcify ({deployment.sourcify.status}) ↗
            </a>
          )}
        </dd>
      </div>
      {deployment && (
        <div>
          <dt>Bytecode check</dt>
          <dd role="status">{verification}</dd>
        </div>
      )}
    </dl>
  );
}
