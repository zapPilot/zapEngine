import { ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import type { ReactElement } from 'react';

import type { BorrowingSummary, RiskMetrics } from '@/services';
import type { ModalType } from '@/types/portfolio';

import { BalanceCardSkeleton } from '../../views/DashboardSkeleton';
import { BorrowingHealthPill } from './BorrowingHealthPill';
import { DataFreshnessIndicator } from './DataFreshnessIndicator';
import { HealthFactorPill } from './HealthFactorPill';
import { HealthWarningBanner } from './HealthWarningBanner';

/** BalanceCard styling constants */
const STYLES = {
  card: 'bg-gray-900/40 backdrop-blur-sm border border-gray-800 rounded-2xl p-6 flex flex-col justify-center',
  label: 'text-xs text-gray-500 font-bold uppercase tracking-widest mb-1',
  netWorthActive: 'text-4xl font-bold tracking-tight mb-2 text-white',
  netWorthEmpty: 'text-4xl font-bold tracking-tight mb-2 text-gray-600',
  buttonBase:
    'flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition-colors border',
  buttonDisabled:
    'bg-gray-800/30 text-gray-600 border-gray-800 cursor-not-allowed',
  depositEnabled:
    'bg-green-500/10 hover:bg-green-500/20 text-green-400 border-green-500/20 cursor-pointer',
  withdrawEnabled:
    'bg-red-500/10 hover:bg-red-500/20 text-red-400 border-red-500/20 cursor-pointer',
} as const;

/** Get button className based on action type and disabled state */
function getButtonClassName(
  type: 'deposit' | 'withdraw',
  isDisabled: boolean,
): string {
  if (isDisabled) {
    return `${STYLES.buttonBase} ${STYLES.buttonDisabled}`;
  }

  if (type === 'deposit') {
    return `${STYLES.buttonBase} ${STYLES.depositEnabled}`;
  }

  return `${STYLES.buttonBase} ${STYLES.withdrawEnabled}`;
}

function getActionTitle(
  isOwnBundle: boolean,
  action: 'deposit' | 'withdraw',
): string | undefined {
  if (isOwnBundle) {
    return undefined;
  }

  if (action === 'deposit') {
    return 'Switch to your bundle to deposit';
  }

  return 'Switch to your bundle to withdraw';
}

interface BalanceCardState {
  isActionsDisabled: boolean;
  showLeverageHealth: boolean;
  showBorrowingAlert: boolean;
}

function deriveBalanceCardState(
  isEmptyState: boolean,
  isOwnBundle: boolean,
  riskMetrics: RiskMetrics | null | undefined,
  borrowingSummary: BorrowingSummary | null | undefined,
): BalanceCardState {
  return {
    isActionsDisabled: isEmptyState || !isOwnBundle,
    showLeverageHealth: Boolean(
      !isEmptyState && riskMetrics?.has_leverage && riskMetrics.health_rate,
    ),
    showBorrowingAlert: Boolean(!isEmptyState && borrowingSummary?.has_debt),
  };
}

interface BalanceRiskColumnProps {
  isEmptyState: boolean;
  lastUpdated: string | null | undefined;
  showLeverageHealth: boolean;
  showBorrowingAlert: boolean;
  riskMetrics: RiskMetrics | null | undefined;
  borrowingSummary: BorrowingSummary | null | undefined;
  isOwnBundle: boolean;
  onViewRiskDetails: (() => void) | undefined;
  userId: string | undefined;
}

function BalanceRiskColumn({
  isEmptyState,
  lastUpdated,
  showLeverageHealth,
  showBorrowingAlert,
  riskMetrics,
  borrowingSummary,
  isOwnBundle,
  onViewRiskDetails,
  userId,
}: BalanceRiskColumnProps): ReactElement {
  const shouldShowBadges = showLeverageHealth || showBorrowingAlert;

  return (
    <div className="flex flex-col items-end gap-1.5">
      {!isEmptyState && lastUpdated && (
        <div className="mb-1">
          <DataFreshnessIndicator
            lastUpdated={lastUpdated}
            size="sm"
            variant="text-only"
            className="opacity-50"
          />
        </div>
      )}
      {shouldShowBadges && (
        <>
          {showLeverageHealth && riskMetrics && (
            <HealthFactorPill
              riskMetrics={riskMetrics}
              isOwnBundle={isOwnBundle}
              size="sm"
              onViewDetails={onViewRiskDetails}
            />
          )}
          {showBorrowingAlert && borrowingSummary && userId && (
            <BorrowingHealthPill
              summary={borrowingSummary}
              userId={userId}
              size="sm"
            />
          )}
        </>
      )}
    </div>
  );
}

interface BalanceActionsProps {
  isActionsDisabled: boolean;
  isOwnBundle: boolean;
  onOpenModal: (type: Extract<ModalType, 'deposit' | 'withdraw'>) => void;
}

function BalanceActions({
  isActionsDisabled,
  isOwnBundle,
  onOpenModal,
}: BalanceActionsProps): ReactElement {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        data-testid="deposit-button"
        onClick={() => onOpenModal('deposit')}
        disabled={isActionsDisabled}
        title={getActionTitle(isOwnBundle, 'deposit')}
        className={getButtonClassName('deposit', isActionsDisabled)}
      >
        <ArrowDownCircle className="w-4 h-4" /> Deposit
      </button>
      <button
        data-testid="withdraw-button"
        onClick={() => onOpenModal('withdraw')}
        disabled={isActionsDisabled}
        title={getActionTitle(isOwnBundle, 'withdraw')}
        className={getButtonClassName('withdraw', isActionsDisabled)}
      >
        <ArrowUpCircle className="w-4 h-4" /> Withdraw
      </button>
    </div>
  );
}

interface BalanceCardProps {
  balance: number;
  isEmptyState?: boolean;
  /** Whether user is viewing their own bundle (enables wallet actions) */
  isOwnBundle?: boolean;
  isLoading?: boolean;
  onOpenModal: (type: Extract<ModalType, 'deposit' | 'withdraw'>) => void;
  lastUpdated?: string | null;
  /** Risk metrics for leveraged positions (null if no leverage) */
  riskMetrics?: RiskMetrics | null;
  /** Borrowing summary for debt positions (null if no debt) */
  borrowingSummary?: BorrowingSummary | null;
  /** Optional handler for viewing detailed risk breakdown (future enhancement) */
  onViewRiskDetails?: () => void;
  /** User ID for fetching detailed borrowing positions */
  userId?: string | undefined;
}

export function BalanceCard({
  balance,
  isEmptyState = false,
  isOwnBundle = true,
  isLoading = false,
  onOpenModal,
  lastUpdated,
  riskMetrics,
  borrowingSummary,
  onViewRiskDetails,
  userId,
}: BalanceCardProps): ReactElement {
  const { isActionsDisabled, showLeverageHealth, showBorrowingAlert } =
    deriveBalanceCardState(
      isEmptyState,
      isOwnBundle,
      riskMetrics,
      borrowingSummary,
    );

  if (isLoading) {
    return <BalanceCardSkeleton />;
  }

  return (
    <>
      {/* Mobile Critical State Warning Banner (Leverage - Always Keep) */}
      {showLeverageHealth && riskMetrics && (
        <HealthWarningBanner
          riskMetrics={riskMetrics}
          onViewDetails={onViewRiskDetails}
        />
      )}

      <div className={STYLES.card}>
        <div className="flex justify-between items-start mb-6">
          <div>
            <div className={STYLES.label}>Net Worth</div>
            <div
              className={
                isEmptyState ? STYLES.netWorthEmpty : STYLES.netWorthActive
              }
              data-testid="net-worth"
            >
              ${balance.toLocaleString()}
            </div>
          </div>

          <BalanceRiskColumn
            isEmptyState={isEmptyState}
            lastUpdated={lastUpdated}
            showLeverageHealth={showLeverageHealth}
            showBorrowingAlert={showBorrowingAlert}
            riskMetrics={riskMetrics}
            borrowingSummary={borrowingSummary}
            isOwnBundle={isOwnBundle}
            onViewRiskDetails={onViewRiskDetails}
            userId={userId}
          />
        </div>

        <BalanceActions
          isActionsDisabled={isActionsDisabled}
          isOwnBundle={isOwnBundle}
          onOpenModal={onOpenModal}
        />
      </div>
    </>
  );
}
