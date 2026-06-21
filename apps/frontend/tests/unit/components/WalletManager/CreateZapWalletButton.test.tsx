import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateZapWalletButton } from '@/components/WalletManager/components/CreateZapWalletButton';

const privyMocks = vi.hoisted(() => ({
  login: vi.fn(),
  authenticated: false,
  ready: true,
  wallets: [] as { walletClientType: string; address: string }[],
}));

vi.mock('@privy-io/react-auth', () => ({
  usePrivy: () => ({
    ready: privyMocks.ready,
    authenticated: privyMocks.authenticated,
    login: privyMocks.login,
  }),
  useWallets: () => ({
    wallets: privyMocks.wallets,
  }),
}));

vi.mock('@/constants/wallet', () => ({
  WALLET_LABELS: {
    CREATE_ZAP_WALLET: 'Create Zap Wallet',
  },
}));

describe('CreateZapWalletButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    privyMocks.authenticated = false;
    privyMocks.ready = true;
    privyMocks.wallets = [];
  });

  it('shows login button when not authenticated', () => {
    render(<CreateZapWalletButton />);

    expect(screen.getByText('Create Zap Wallet')).toBeInTheDocument();
    expect(screen.getByRole('button')).not.toBeDisabled();
  });

  it('calls login when button is clicked', () => {
    render(<CreateZapWalletButton />);

    fireEvent.click(screen.getByText('Create Zap Wallet'));

    expect(privyMocks.login).toHaveBeenCalledTimes(1);
  });

  it('disables button when not ready', () => {
    privyMocks.ready = false;

    render(<CreateZapWalletButton />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows shortened address when authenticated with embedded wallet', () => {
    privyMocks.authenticated = true;
    privyMocks.wallets = [
      {
        walletClientType: 'privy',
        address: '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940',
      },
    ];

    render(<CreateZapWalletButton />);

    expect(screen.getByText('0xf8a6...f940')).toBeInTheDocument();
  });

  it('shows disabled wallet button when authenticated with embedded wallet', () => {
    privyMocks.authenticated = true;
    privyMocks.wallets = [
      {
        walletClientType: 'privy',
        address: '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940',
      },
    ];

    render(<CreateZapWalletButton />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('applies custom className', () => {
    const { container } = render(
      <CreateZapWalletButton className="custom-class" />,
    );

    expect(container.firstChild).toHaveClass('custom-class');
  });

  it('does not show login button when authenticated', () => {
    privyMocks.authenticated = true;
    privyMocks.wallets = [
      {
        walletClientType: 'privy',
        address: '0xf8a6b8ce3a6c8F4E5a73600a89aE9A645EAEf940',
      },
    ];

    render(<CreateZapWalletButton />);

    expect(screen.queryByText('Create Zap Wallet')).not.toBeInTheDocument();
  });

  it('shows login button when authenticated but no embedded wallet', () => {
    privyMocks.authenticated = true;
    privyMocks.wallets = [
      {
        walletClientType: 'metamask',
        address: '0x1234567890123456789012345678901234567890',
      },
    ];

    render(<CreateZapWalletButton />);

    expect(screen.getByText('Create Zap Wallet')).toBeInTheDocument();
  });
});
