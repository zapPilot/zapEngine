import type { ReactElement } from "react";

import { GradientButton, LoadingSpinner } from "@/components/ui";

import type { OperationState } from "../types/wallet.types";

interface EmailSubscriptionProps {
  email: string;
  subscribedEmail: string | null;
  isEditingSubscription: boolean;
  subscriptionOperation: OperationState;
  onEmailChange: (email: string) => void;
  onSubscribe: () => void;
  onUnsubscribe: () => void;
  onStartEditing: () => void;
  onCancelEditing: () => void;
}

export function EmailSubscription({
  email,
  subscribedEmail,
  isEditingSubscription,
  subscriptionOperation,
  onEmailChange,
  onSubscribe,
  onUnsubscribe,
  onStartEditing,
  onCancelEditing,
}: EmailSubscriptionProps): ReactElement {
  const subscribeButtonText = subscribedEmail ? "Save" : "Subscribe";

  return (
    <div className="p-6 bg-gray-900/20">
      <h3 className="text-sm font-medium text-gray-300 mb-3">
        Weekly PnL Reports
      </h3>

      {subscribedEmail && !isEditingSubscription ? (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-300">
            ✅ You&apos;re subscribed to weekly PnL reports
            <span className="text-gray-400"> at </span>
            <span className="text-white font-medium">{subscribedEmail}</span>.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={onStartEditing}
              className="px-3 py-1.5 text-xs rounded-lg glass-morphism hover:bg-white/10 transition-colors"
            >
              ✏️ Update email
            </button>
            <button
              onClick={onUnsubscribe}
              className="px-3 py-1.5 text-xs rounded-lg bg-red-600/10 text-red-300 border border-red-600/20 hover:bg-red-600/20 transition-colors"
            >
              Unsubscribe
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex space-x-2">
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={e => onEmailChange(e.target.value)}
              className="w-full bg-gray-800/50 text-white px-3 py-2 rounded-lg border border-gray-600 focus:border-purple-500 outline-none"
            />
            <GradientButton
              onClick={onSubscribe}
              gradient="from-blue-600 to-cyan-600"
              disabled={subscriptionOperation.isLoading}
            >
              {subscriptionOperation.isLoading ? (
                <LoadingSpinner size="sm" color="white" />
              ) : (
                subscribeButtonText
              )}
            </GradientButton>
            {subscribedEmail && (
              <button
                onClick={onCancelEditing}
                className="px-3 py-2 text-xs glass-morphism rounded-lg hover:bg-white/10 transition-colors text-gray-300"
              >
                Cancel
              </button>
            )}
          </div>
          {subscriptionOperation.error && (
            <div className="mt-2 p-2 bg-red-600/10 border border-red-600/20 rounded-lg">
              <p className="text-xs text-red-300">
                {subscriptionOperation.error}
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
