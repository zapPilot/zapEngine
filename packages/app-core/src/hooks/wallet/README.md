# Wallet Hooks

Focused hooks for wallet management, operations, and account handling. There is
no orchestrator: each consumer composes the hooks it needs.

## Hooks

### useWalletList

Manages wallet list loading and periodic refresh.

```typescript
const { wallets, setWallets, isRefreshing, loadWallets } = useWalletList({
  userId,
  connectedWallets,
  isOpen,
  isOwner,
});
```

### useWalletMutations

Handles wallet add/delete operations with validation and optimistic updates.

```typescript
const { handleDeleteWallet, handleAddWallet, addingState } = useWalletMutations(
  {
    userId,
    operations,
    setOperations,
    setWallets,
    setWalletOperationState,
    loadWallets,
  },
);
```

### useWalletLabels

Manages wallet label editing with optimistic updates and rollback on failure.

```typescript
const { handleEditLabel } = useWalletLabels({
  userId,
  wallets,
  setWallets,
  setEditingWallet,
  setWalletOperationState,
});
```

### useEtlJobPolling

Polls an alpha-etl job until it settles, so a freshly added wallet can show
indexing progress.

### useAtomicBatchExecution

Runs an EIP-5792 batch through the connected wallet backend.

### usePrivyWalletBackend / useWagmiWalletBackend

Web-only wallet backends. React Native must not import these — see the
restricted-import rules in `apps/app/eslint.config.mjs`.

## Guidelines

- Import each hook by its own module path; the barrels drag the whole app-core
  services surface into the bundle.
- All mutations include optimistic updates for better UX
- Error handling with user-friendly toast notifications
