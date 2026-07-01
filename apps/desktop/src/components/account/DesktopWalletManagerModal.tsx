import {
  getWalletDescription,
  getWalletManagerIdentity,
  useEmailSubscription,
  useWalletOperations,
} from '@zapengine/app-core/hooks/bundle';
import { useUser } from '@zapengine/app-core/hooks/queries/wallet/useUser';
import type { WalletData } from '@zapengine/app-core/lib/validation/walletUtils';
import { Check, Copy, Edit3, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { SkeletonBlock } from '@/components/ui/Skeleton';
import { truncateAddress } from '@/lib/format';

interface DesktopWalletManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  urlUserId?: string;
  onEmailSubscribed?: () => void;
}

type WalletOperationsState = ReturnType<typeof useWalletOperations>;
type EmailSubscriptionState = ReturnType<typeof useEmailSubscription>;

interface EditingWalletDraft {
  walletId: string;
  label: string;
}

function panelStyle(tone: 'normal' | 'accent' = 'normal') {
  return {
    background:
      tone === 'accent'
        ? 'linear-gradient(150deg,rgba(212,197,163,.1),rgba(255,255,255,.025))'
        : 'rgba(255,255,255,.025)',
    border:
      tone === 'accent'
        ? '1px solid rgba(212,197,163,.26)'
        : '1px solid rgba(255,255,255,.08)',
  } as const;
}

function Field({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[9px] uppercase tracking-[.12em] text-ink-faint">
        {label}
      </span>
      <input
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1.5 w-full rounded-[12px] px-3 py-2.5 font-mono text-[12px] text-ink outline-none"
        style={panelStyle()}
      />
    </label>
  );
}

function WalletRow({
  wallet,
  isOwner,
  isEditing,
  editLabel,
  onEditLabelChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onCopy,
  onDelete,
  onSwitch,
}: {
  wallet: WalletData;
  isOwner: boolean;
  isEditing: boolean;
  editLabel: string;
  onEditLabelChange: (value: string) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onCopy: () => void;
  onDelete: () => void;
  onSwitch: () => void;
}) {
  return (
    <div className="rounded-[14px] p-3" style={panelStyle('accent')}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              value={editLabel}
              onChange={(event) => onEditLabelChange(event.target.value)}
              className="w-full rounded-[10px] px-2 py-1.5 text-[13px] font-semibold text-ink outline-none"
              style={panelStyle()}
            />
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate text-[13.5px] font-semibold text-ink">
                {wallet.label}
              </span>
              {wallet.isActive ? (
                <span className="rounded-full bg-success/15 px-2 py-0.5 font-mono text-[8.5px] uppercase tracking-[.08em] text-success">
                  Active
                </span>
              ) : null}
            </div>
          )}
          <div className="mt-1 font-mono text-[11px] text-ink-dim">
            {truncateAddress(wallet.address)}
          </div>
        </div>
        <button
          type="button"
          className="zp-tap grid h-8 w-8 place-items-center rounded-full text-accent"
          style={panelStyle()}
          aria-label="Copy wallet address"
          onClick={onCopy}
        >
          <Copy size={14} />
        </button>
      </div>
      {isOwner ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {isEditing ? (
            <>
              <button
                type="button"
                className="zp-tap rounded-full px-3 py-1.5 text-[11px] font-semibold text-accent"
                style={panelStyle()}
                onClick={onSaveEdit}
              >
                Save
              </button>
              <button
                type="button"
                className="zp-tap rounded-full px-3 py-1.5 text-[11px] text-ink-dim"
                onClick={onCancelEdit}
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              type="button"
              className="zp-tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-ink-dim"
              style={panelStyle()}
              onClick={onStartEdit}
            >
              <Edit3 size={12} />
              Edit
            </button>
          )}
          {!wallet.isActive ? (
            <button
              type="button"
              className="zp-tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-accent"
              style={panelStyle()}
              onClick={onSwitch}
            >
              <Check size={12} />
              Use
            </button>
          ) : null}
          <button
            type="button"
            className="zp-tap inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] text-error"
            style={panelStyle()}
            onClick={onDelete}
          >
            <Trash2 size={12} />
            Remove
          </button>
        </div>
      ) : null}
    </div>
  );
}

function WalletListSection({
  walletOperations,
  isOwnerView,
  editing,
  setEditing,
}: {
  walletOperations: WalletOperationsState;
  isOwnerView: boolean;
  editing: EditingWalletDraft | null;
  setEditing: (editing: EditingWalletDraft | null) => void;
}) {
  if (walletOperations.wallets.length === 0) {
    return (
      <div
        className="rounded-[14px] px-4 py-7 text-center text-[12px] text-ink-faint"
        style={panelStyle()}
      >
        {isOwnerView
          ? 'Add wallets to this bundle.'
          : 'No wallets in this bundle.'}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {walletOperations.wallets.map((wallet) => {
        const isEditing = editing?.walletId === wallet.id;
        const saveEdit = () => {
          const label = isEditing ? editing.label : null;
          if (label === null) {
            return;
          }
          void walletOperations.handleEditLabel(wallet.id, label);
          setEditing(null);
        };

        return (
          <WalletRow
            key={wallet.id}
            wallet={wallet}
            isOwner={isOwnerView}
            isEditing={isEditing}
            editLabel={isEditing ? editing.label : ''}
            onEditLabelChange={(label) =>
              setEditing({ walletId: wallet.id, label })
            }
            onStartEdit={() =>
              setEditing({ walletId: wallet.id, label: wallet.label })
            }
            onCancelEdit={() => setEditing(null)}
            onSaveEdit={saveEdit}
            onCopy={() =>
              void walletOperations.handleCopyAddress(wallet.address)
            }
            onDelete={() => void walletOperations.handleDeleteWallet(wallet.id)}
            onSwitch={() =>
              void walletOperations.handleSwitchWallet(wallet.address)
            }
          />
        );
      })}
    </div>
  );
}

function AddWalletSection({
  walletOperations,
  onWalletChange,
}: {
  walletOperations: WalletOperationsState;
  onWalletChange: (
    changes: Partial<WalletOperationsState['newWallet']>,
  ) => void;
}) {
  const cancelAdd = () => {
    walletOperations.setIsAdding(false);
    walletOperations.setNewWallet({ address: '', label: '' });
  };

  return (
    <div className="rounded-[16px] p-4" style={panelStyle()}>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[13px] font-semibold text-ink">Add wallet</span>
        {!walletOperations.isAdding ? (
          <button
            type="button"
            className="zp-tap grid h-8 w-8 place-items-center rounded-full text-accent"
            style={panelStyle('accent')}
            onClick={() => walletOperations.setIsAdding(true)}
            aria-label="Add wallet"
          >
            <Plus size={16} />
          </button>
        ) : null}
      </div>
      {walletOperations.isAdding ? (
        <div className="space-y-3">
          <Field
            label="Address"
            value={walletOperations.newWallet.address}
            placeholder="0x..."
            onChange={(address) => onWalletChange({ address })}
          />
          <Field
            label="Label"
            value={walletOperations.newWallet.label}
            placeholder="Treasury"
            onChange={(label) => onWalletChange({ label })}
          />
          {walletOperations.validationError ? (
            <div className="text-[11px] text-error">
              {walletOperations.validationError}
            </div>
          ) : null}
          <div className="flex gap-2">
            <PrimaryButton
              className="flex-1 py-2.5 text-[12px]"
              onClick={() => void walletOperations.handleAddWallet()}
              disabled={walletOperations.operations.adding.isLoading}
            >
              Add
            </PrimaryButton>
            <button
              type="button"
              className="zp-tap rounded-[12px] px-3 text-[12px] text-ink-dim"
              onClick={cancelAdd}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="text-[11px] text-ink-faint">
          Bundle wallets power portfolio and activity views.
        </div>
      )}
    </div>
  );
}

function EmailSubscriptionSection({
  emailSubscription,
}: {
  emailSubscription: EmailSubscriptionState;
}) {
  return (
    <div className="rounded-[16px] p-4" style={panelStyle()}>
      <div className="text-[13px] font-semibold text-ink">Weekly reports</div>
      <div className="mt-1 text-[11px] text-ink-faint">
        {emailSubscription.subscribedEmail
          ? `Subscribed: ${emailSubscription.subscribedEmail}`
          : 'No email subscription set.'}
      </div>
      <div className="mt-3 space-y-3">
        <Field
          label="Email"
          value={emailSubscription.email}
          placeholder="you@example.com"
          onChange={emailSubscription.setEmail}
        />
        {emailSubscription.subscriptionOperation.error ? (
          <div className="text-[11px] text-error">
            {emailSubscription.subscriptionOperation.error}
          </div>
        ) : null}
        <div className="flex gap-2">
          <PrimaryButton
            className="flex-1 py-2.5 text-[12px]"
            disabled={emailSubscription.subscriptionOperation.isLoading}
            onClick={() => void emailSubscription.handleSubscribe()}
          >
            Save email
          </PrimaryButton>
          {emailSubscription.subscribedEmail ? (
            <button
              type="button"
              className="zp-tap rounded-[12px] px-3 text-[12px] text-error"
              onClick={() => void emailSubscription.handleUnsubscribe()}
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DeleteAccountAction({
  walletOperations,
}: {
  walletOperations: WalletOperationsState;
}) {
  return (
    <button
      type="button"
      className="zp-tap w-full rounded-[14px] px-4 py-3 text-[12px] font-semibold text-error"
      style={panelStyle()}
      onClick={() => void walletOperations.handleDeleteAccount()}
      disabled={walletOperations.isDeletingAccount}
    >
      {walletOperations.isDeletingAccount
        ? 'Deleting account...'
        : 'Delete account'}
    </button>
  );
}

export function DesktopWalletManagerModal({
  isOpen,
  onClose,
  urlUserId,
  onEmailSubscribed,
}: DesktopWalletManagerModalProps) {
  const { userInfo, loading, error, isConnected, refetch } = useUser();
  const { realUserId, viewingUserId, isOwnerView } = getWalletManagerIdentity(
    urlUserId,
    userInfo?.userId,
  );
  const walletOperations = useWalletOperations({
    viewingUserId,
    realUserId,
    isOwner: isOwnerView,
    isOpen,
  });
  const emailSubscription = useEmailSubscription({
    viewingUserId,
    realUserId,
    isOpen,
    onEmailSubscribed,
  });
  const [editing, setEditing] = useState<EditingWalletDraft | null>(null);

  const handleWalletChange = useCallback(
    (changes: Partial<typeof walletOperations.newWallet>) => {
      walletOperations.setNewWallet((current) => ({
        ...current,
        ...changes,
      }));
    },
    [walletOperations],
  );

  if (!isOpen) {
    return null;
  }

  const isBusy = loading || walletOperations.isRefreshing;
  const showContent = !isBusy && !error;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-black/58 px-3 py-4 backdrop-blur-sm">
      <div
        className="max-h-[88vh] w-full max-w-[390px] overflow-y-auto rounded-[24px] shadow-[0_24px_70px_rgba(0,0,0,.55)]"
        style={{
          background: '#0b0b0c',
          border: '1px solid rgba(255,255,255,.1)',
        }}
      >
        <div
          className="sticky top-0 z-10 flex items-center justify-between px-4 py-4"
          style={{
            background: 'rgba(11,11,12,.94)',
            borderBottom: '1px solid rgba(255,255,255,.07)',
          }}
        >
          <div>
            <div className="text-[16px] font-semibold text-ink">
              Bundled Wallets
            </div>
            <div className="mt-0.5 text-[11px] text-ink-faint">
              {getWalletDescription(isConnected, isOwnerView)}
            </div>
          </div>
          <button
            type="button"
            aria-label="Close wallet manager"
            className="zp-tap grid h-9 w-9 place-items-center rounded-full text-ink-dim"
            style={panelStyle()}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {isBusy ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-16 w-full rounded-[14px]" />
              <SkeletonBlock className="h-16 w-full rounded-[14px]" />
            </div>
          ) : null}

          {error ? (
            <div
              className="rounded-[14px] p-4 text-center"
              style={panelStyle()}
            >
              <div className="text-[13px] text-error">{error}</div>
              <button
                type="button"
                className="zp-tap mt-3 rounded-full px-3 py-1.5 text-[11px] text-accent"
                style={panelStyle('accent')}
                onClick={() => void refetch()}
              >
                Retry
              </button>
            </div>
          ) : null}

          {showContent ? (
            <>
              <WalletListSection
                walletOperations={walletOperations}
                isOwnerView={isOwnerView}
                editing={editing}
                setEditing={setEditing}
              />

              {isOwnerView ? (
                <AddWalletSection
                  walletOperations={walletOperations}
                  onWalletChange={handleWalletChange}
                />
              ) : null}

              {isOwnerView ? (
                <EmailSubscriptionSection
                  emailSubscription={emailSubscription}
                />
              ) : null}

              {isOwnerView ? (
                <DeleteAccountAction walletOperations={walletOperations} />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
