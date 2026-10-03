import { useEffect, useState } from 'react';
import type { EIP1193Provider, Hex } from 'viem';
import {
  DEPLOYMENT_ADDRESS,
  deployStrategy,
} from '@/lib/verifiable-strategy/deployment';
import type { Deployment } from '@/lib/verifiable-strategy/types';

export function DeployStrategy({
  onDeployed,
}: {
  onDeployed: (deployment: Deployment) => void;
}) {
  const [provider, setProvider] = useState<EIP1193Provider>();
  const [account, setAccount] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [transaction, setTransaction] = useState<Hex>();
  useEffect(() => {
    function announce(event: Event) {
      const detail = (
        event as CustomEvent<{
          info: { rdns: string };
          provider: EIP1193Provider;
        }>
      ).detail;
      if (detail?.info.rdns === 'io.rabby') setProvider(detail.provider);
    }
    window.addEventListener('eip6963:announceProvider', announce);
    window.dispatchEvent(new Event('eip6963:requestProvider'));
    return () =>
      window.removeEventListener('eip6963:announceProvider', announce);
  }, []);
  useEffect(() => {
    if (!provider) return;
    const reset = () => setAccount('');
    provider.on('accountsChanged', reset);
    provider.on('disconnect', reset);
    return () => {
      provider.removeListener('accountsChanged', reset);
      provider.removeListener('disconnect', reset);
    };
  }, [provider]);
  async function connect() {
    if (!provider) {
      setStatus(
        'Rabby not detected. Install or unlock the Rabby browser extension, then reload.',
      );
      return;
    }
    setBusy(true);
    try {
      const accounts = await provider.request({
        method: 'eth_requestAccounts',
      });
      setAccount(accounts[0] ?? '');
      setStatus(
        accounts.length
          ? 'Rabby connected. Deployment uses Arbitrum Sepolia test ETH for gas.'
          : 'Select an account in Rabby.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Connection rejected');
    } finally {
      setBusy(false);
    }
  }
  async function deploy() {
    // Deploy is only offered after Connect sets an account, which requires
    // the announced Rabby provider, so provider is always defined here.
    const active = provider as EIP1193Provider;
    setBusy(true);
    setStatus('Confirm the Arbitrum Sepolia network and deployment in Rabby.');
    try {
      const deployment = await deployStrategy(active, (hash) => {
        setTransaction(hash);
        setStatus('Transaction sent. Waiting for confirmation…');
      });
      onDeployed(deployment);
      setStatus(
        'Deployed. Runtime codehash verified. You can now call the contract. Save the transaction hash to publish and verify the deployment.',
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Deployment failed');
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="calc-deploy" aria-label="Deploy research contract">
      <span className="calc-deploy-network">Arbitrum Sepolia · Testnet</span>
      <h2>Deploy with Rabby</h2>
      <p>
        Deploy this public Vyper research contract on Arbitrum Sepolia. No token
        approvals or deposits; only test ETH gas.
      </p>
      <p className="calc-deploy-address">
        Deterministic address: <code>{DEPLOYMENT_ADDRESS}</code>
      </p>
      <button
        className="calc-call"
        type="button"
        disabled={busy}
        onClick={() => void connect()}
      >
        Connect Rabby wallet
      </button>
      {account && (
        <>
          <p>
            Connected: <code>{account}</code>
          </p>
          <button
            className="calc-call"
            type="button"
            disabled={busy}
            onClick={() => void deploy()}
          >
            Deploy to Arbitrum Sepolia
          </button>
        </>
      )}
      {status && (
        <p className="calc-deploy-status" role="status">
          {status}
        </p>
      )}
      {transaction && (
        <details className="calc-deploy-receipt">
          <summary>Deployment receipt & publishing</summary>
          <a
            href={`https://sepolia.arbiscan.io/tx/${transaction}`}
            target="_blank"
            rel="noreferrer"
          >
            Deployment transaction: {transaction}
          </a>
          <p>Publish the verified deployment from your terminal:</p>
          <pre>{`cd apps/analytics-engine
uv run python -m scripts.pinned_strategy.deploy --transaction ${transaction}
uv run python -m scripts.pinned_strategy.export_landing_examples --refresh-deployment`}</pre>
        </details>
      )}
    </section>
  );
}
