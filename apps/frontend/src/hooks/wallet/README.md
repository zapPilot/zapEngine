# Wallet Hooks

Custom hooks for wallet management, operations, and account handling.

## Architecture

The wallet hooks follow a **facade pattern** where smaller, focused hooks are composed into a single
orchestrator hook (`useWalletOperations`) for backward compatibility.

## Hooks

### useWalletOperations (Facade)

Main orchestrator hook that composes all wallet functionality. Use this for full wallet management
features.

```typescript
const {
  wallets,
  operations,
  isRefreshing,
  handleAddWallet,
  handleDeleteWallet,
  handleEditLabel,
  handleDeleteAccount,
  // ... other operations
} = useWalletOperations({ viewingUserId, realUserId, isOwner, isOpen });
```

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
const { handleDeleteWallet, handleAddWallet, addingState } = useWalletMutations({
  userId,
  operations,
  setOperations,
  setWallets,
  setWalletOperationState,
  loadWallets,
});
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

### useAccountDeletion

Handles account deletion with wallet disconnection and cleanup.

```typescript
const { isDeletingAccount, handleDeleteAccount } = useAccountDeletion({
  userId,
});
```

## Guidelines

- Use `useWalletOperations` for components that need full wallet management
- Use individual hooks for components with specific needs (testing, composition)
- All mutations include optimistic updates for better UX
- Error handling with user-friendly toast notifications
