import type { ReactNode } from "react";

import { ActionCard } from "./ActionCard";
import { ReviewModal } from "./ReviewModal";

interface BaseTradingPanelProps {
  /** Page-level title (e.g. "Portfolio Health", "Deposit") */
  title: ReactNode;
  /** Page-level subtitle below the title */
  subtitle: ReactNode;
  /** Optional badge rendered above the title (e.g. regime indicator) */
  headerBadge?: ReactNode;

  /** ActionCard header — title text (optional, rebalance uses it) */
  actionCardTitle?: ReactNode;
  /** ActionCard header — subtitle text */
  actionCardSubtitle?: ReactNode;
  /** ActionCard header — icon element */
  actionCardIcon?: ReactNode;
  /** Optional allocation impact visual shown above panel content */
  impactVisual?: ReactNode;

  /** Panel-specific content rendered below ImpactVisual inside ActionCard */
  children: ReactNode;
  /** ActionCard footer slot (CTA button) */
  footer: ReactNode;

  /** Whether the ReviewModal is open */
  isReviewOpen: boolean;
  /** Close handler for ReviewModal */
  onCloseReview: () => void;
  /** Confirm handler for ReviewModal */
  onConfirmReview: () => void;
  /** Whether the ReviewModal confirm action is in-flight */
  isSubmitting?: boolean;
  /** ReviewModal heading override */
  reviewTitle?: string;
}

export function BaseTradingPanel({
  title,
  subtitle,
  headerBadge,
  actionCardTitle,
  actionCardSubtitle,
  actionCardIcon,
  impactVisual,
  children,
  footer,
  isReviewOpen,
  onCloseReview,
  onConfirmReview,
  isSubmitting = false,
  reviewTitle = "Review Execution",
}: BaseTradingPanelProps) {
  return (
    <>
      <div className="max-w-md mx-auto space-y-12 animate-in slide-in-from-bottom-4 duration-700">
        <div className="text-center space-y-2">
          {headerBadge}
          <h3 className="text-4xl font-light text-gray-900 dark:text-white">
            {title}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 font-light">
            {subtitle}
          </p>
        </div>

        <ActionCard
          title={actionCardTitle}
          subtitle={actionCardSubtitle}
          icon={actionCardIcon}
          footer={footer}
        >
          {impactVisual ? (
            <div className="p-6 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-100 dark:border-gray-800">
              {impactVisual}
            </div>
          ) : null}
          {children}
        </ActionCard>
      </div>

      <ReviewModal
        isOpen={isReviewOpen}
        onClose={onCloseReview}
        onConfirm={onConfirmReview}
        isSubmitting={isSubmitting}
        title={reviewTitle}
      />
    </>
  );
}
