import { useWalletProvider } from '@zapengine/app-core/providers/WalletProvider';
import { ArrowUp, Check, Loader2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { StepHeader } from '@/components/invest/StepHeader';
import { ChainIconStack } from '@/components/token/ChainIconStack';
import { TokenIcon } from '@/components/token/TokenIcon';
import { Card } from '@/components/ui/Card';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { type ChainKey, CHAINS } from '@/data/demo';
import {
  buildSendTransactionRequest,
  defaultSendChain,
  holdingForChain,
  isWalletAddress,
  SEND_CHAIN_OPTIONS,
} from '@/integration/sendTransactions';
import { useAccount } from '@/integration/useAccount';
import {
  type DesktopWalletAsset,
  useWalletAssets,
} from '@/integration/walletTokens';
import { formatUsd, truncateAddress } from '@/lib/format';

function normalizeTokenParam(value: string | null): string {
  return value?.trim().toUpperCase() ?? '';
}

function TokenSkeletonList() {
  return (
    <div aria-label="Loading sendable tokens" role="status">
      {[0, 1, 2].map((item) => (
        <div key={item} className="flex items-center gap-2.5 px-1 py-2">
          <SkeletonBlock className="h-[30px] w-[30px] rounded-full" />
          <div className="min-w-0 flex-1">
            <SkeletonBlock className="h-4 w-14" />
            <SkeletonBlock className="mt-2 h-3 w-28" />
          </div>
          <SkeletonBlock className="h-4 w-16" />
        </div>
      ))}
      <span className="sr-only">Loading sendable tokens…</span>
    </div>
  );
}

function SendTokenButton({
  asset,
  active,
  onClick,
}: {
  asset: DesktopWalletAsset;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      data-testid={`send-token-${asset.symbol}`}
      onClick={onClick}
      className="zp-tap flex w-full items-center gap-2.5 rounded-xl px-1 py-2 text-left"
      style={active ? { background: 'rgba(212,197,163,.09)' } : undefined}
    >
      <TokenIcon glyph={asset.glyph} bg={asset.iconBg} size={30} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5">
          <span className="text-[14px] font-semibold text-ink">
            {asset.symbol}
          </span>
          <span className="truncate text-[11px] text-ink-dim">
            {asset.name}
          </span>
        </div>
        <div className="mt-[4px] flex items-center gap-1.5">
          <ChainIconStack chains={asset.chains} size={12} />
          <span className="font-mono text-[9.5px] text-ink-faint">
            {asset.amountLabel}
          </span>
        </div>
      </div>
      <span className="text-[13px] font-semibold text-ink">
        {typeof asset.usdValue === 'number' ? formatUsd(asset.usdValue) : '—'}
      </span>
    </button>
  );
}

function inputClassName() {
  return [
    'w-full rounded-[15px] border border-line bg-[rgba(255,255,255,.045)]',
    'px-4 py-3 text-[14px] text-ink outline-none',
    'placeholder:text-ink-faint focus:border-[rgba(212,197,163,.42)]',
  ].join(' ');
}

/** Send — token + chain transfer form backed by the Privy wallet adapter. */
export function SendScreen() {
  const [searchParams] = useSearchParams();
  const requestedToken = normalizeTokenParam(searchParams.get('token'));
  const { address, isConnected } = useAccount();
  const wallet = useWalletProvider();
  const walletAssets = useWalletAssets(address);
  const [selectedSymbol, setSelectedSymbol] = useState(requestedToken);
  const [selectedChain, setSelectedChain] = useState<ChainKey>('base');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<
    | { kind: 'idle' }
    | { kind: 'sending' }
    | { kind: 'success'; hash: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const assets = walletAssets.assets;
  const selectedAsset = useMemo(
    () =>
      assets.find((asset) => asset.symbol === selectedSymbol) ??
      assets.find((asset) => asset.symbol === requestedToken) ??
      assets[0] ??
      null,
    [assets, requestedToken, selectedSymbol],
  );
  const selectedHolding = holdingForChain(selectedAsset, selectedChain);
  const supportedChainOptions = selectedAsset
    ? SEND_CHAIN_OPTIONS.filter((option) =>
        holdingForChain(selectedAsset, option.key),
      )
    : [];

  useEffect(() => {
    if (!selectedAsset) return;
    setSelectedSymbol(selectedAsset.symbol);
    if (!holdingForChain(selectedAsset, selectedChain)) {
      setSelectedChain(defaultSendChain(selectedAsset));
    }
  }, [selectedAsset, selectedChain]);

  const canSend =
    isConnected &&
    selectedAsset !== null &&
    selectedHolding !== null &&
    isWalletAddress(recipient) &&
    amount.trim() !== '' &&
    status.kind !== 'sending';

  const handleSend = async () => {
    if (!selectedAsset || !selectedHolding) {
      return;
    }

    try {
      setStatus({ kind: 'sending' });
      await wallet.switchChain(selectedHolding.chainId);
      const tx = buildSendTransactionRequest({
        amount,
        asset: selectedAsset,
        holding: selectedHolding,
        recipient,
      });
      const hash = await wallet.sendTransaction(tx);
      setStatus({ kind: 'success', hash });
    } catch (error) {
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  };

  return (
    <div className="pb-6 font-sans text-ink" data-screen="send">
      <StepHeader title="Send assets" step="PRIVY TRANSFER" />

      <div className="px-5 pt-[22px]">
        <div className="font-serif text-[42px] leading-none">Send</div>
        <div className="mt-2 text-[12.5px] leading-5 text-ink-dim">
          Choose token and chain, then Privy will switch networks and ask you to
          approve the transfer.
        </div>
      </div>

      <Card className="mx-5 mt-[18px] rounded-[18px]">
        <div className="px-4 py-[15px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-ink-dim">From wallet</span>
            <span className="font-mono text-[11px] text-ink">
              {address ? truncateAddress(address) : 'Not connected'}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-success">
            <Check size={12} strokeWidth={3} />
            Privy wallet transaction
          </div>
        </div>
      </Card>

      <Card className="mx-5 mt-3 rounded-[18px]">
        <div className="px-4 py-[15px]">
          <div className="text-[12px] font-semibold text-ink-dim">Token</div>
          <div className="mt-2 flex flex-col gap-1">
            {walletAssets.isConnected && walletAssets.isLoading ? (
              <TokenSkeletonList />
            ) : walletAssets.isConnected && walletAssets.isError ? (
              <div className="px-1 py-2 text-[12px] text-ink-faint">
                Wallet tokens unavailable.
              </div>
            ) : assets.length === 0 ? (
              <div className="px-1 py-2 text-[12px] text-ink-faint">
                No supported token holdings in the active wallet.
              </div>
            ) : (
              assets.map((asset) => (
                <SendTokenButton
                  key={asset.symbol}
                  asset={asset}
                  active={selectedAsset?.symbol === asset.symbol}
                  onClick={() => {
                    setSelectedSymbol(asset.symbol);
                    setSelectedChain(defaultSendChain(asset));
                    setStatus({ kind: 'idle' });
                  }}
                />
              ))
            )}
          </div>
        </div>
      </Card>

      <Card className="mx-5 mt-3 rounded-[18px]">
        <div className="px-4 py-[15px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-semibold text-ink-dim">
              Chain
            </span>
            {selectedHolding ? (
              <span className="font-mono text-[10px] text-ink-faint">
                Balance {selectedHolding.rawAmount.toLocaleString('en-US')}{' '}
                {selectedAsset?.symbol}
              </span>
            ) : null}
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {SEND_CHAIN_OPTIONS.map((option) => {
              const enabled = supportedChainOptions.some(
                (candidate) => candidate.key === option.key,
              );
              const active = selectedChain === option.key && enabled;
              return (
                <button
                  key={option.key}
                  type="button"
                  data-testid={`send-chain-${option.key}`}
                  aria-pressed={active}
                  disabled={!enabled}
                  onClick={() => {
                    setSelectedChain(option.key);
                    setStatus({ kind: 'idle' });
                  }}
                  className="zp-tap rounded-full px-2 py-2 text-[11px] font-semibold disabled:opacity-35"
                  style={
                    active
                      ? { background: 'var(--accent)', color: '#0a0a0a' }
                      : {
                          background: 'rgba(255,255,255,.045)',
                          color: '#a1a1aa',
                        }
                  }
                >
                  {CHAINS[option.key].label}
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      <div className="mx-5 mt-3 flex flex-col gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-ink-dim">
            Recipient
          </span>
          <input
            aria-label="Recipient address"
            className={inputClassName()}
            value={recipient}
            onChange={(event) => {
              setRecipient(event.target.value);
              setStatus({ kind: 'idle' });
            }}
            placeholder="0x..."
            autoCapitalize="none"
            autoCorrect="off"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[12px] font-semibold text-ink-dim">
            Amount
          </span>
          <div className="flex gap-2">
            <input
              aria-label="Amount"
              className={inputClassName()}
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setStatus({ kind: 'idle' });
              }}
              placeholder="0.00"
              inputMode="decimal"
            />
            <button
              type="button"
              className="zp-tap rounded-[15px] border border-line px-4 text-[12px] font-semibold text-accent"
              style={{ background: 'rgba(255,255,255,.045)' }}
              disabled={!selectedHolding}
              onClick={() => {
                setAmount(String(selectedHolding?.rawAmount ?? ''));
                setStatus({ kind: 'idle' });
              }}
            >
              Max
            </button>
          </div>
        </label>
      </div>

      <div className="px-5 pt-4">
        <PrimaryButton
          onClick={handleSend}
          disabled={!canSend}
          className="disabled:opacity-45"
        >
          {status.kind === 'sending' ? (
            <Loader2 className="animate-spin" size={17} aria-hidden="true" />
          ) : (
            <ArrowUp size={17} strokeWidth={2.2} aria-hidden="true" />
          )}
          Send {selectedAsset?.symbol ?? 'token'}
        </PrimaryButton>
        <div className="mt-[9px] min-h-8 text-center text-[11px] text-ink-faint">
          {status.kind === 'success'
            ? `Submitted ${truncateAddress(status.hash)}`
            : status.kind === 'error'
              ? status.message
              : selectedHolding
                ? `Transfers on ${CHAINS[selectedHolding.chain].label} use chain ID ${selectedHolding.chainId}.`
                : 'Select a token with a supported chain.'}
        </div>
      </div>

      <div className="h-[14px]" aria-hidden="true" />
    </div>
  );
}
