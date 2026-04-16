import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useState,
} from "react";

import { useUser } from "@/contexts/UserContext";
import { useOperationStateHandlers } from "@/hooks/utils/useOperationState";
import { handleWalletError } from "@/lib/validation/walletUtils";
import { useToast } from "@/providers/ToastProvider";

import {
  unsubscribeUserEmail,
  updateUserEmailSubscription,
} from "../services/WalletService";
import type { OperationState } from "../types/wallet.types";
import { validateEmail } from "../utils/validation";

interface UseEmailSubscriptionParams {
  viewingUserId: string;
  realUserId: string;
  isOpen: boolean;
  onEmailSubscribed: (() => void) | undefined;
}

interface UseEmailSubscriptionReturn {
  email: string;
  subscribedEmail: string | null;
  isEditingSubscription: boolean;
  subscriptionOperation: OperationState;
  setEmail: Dispatch<SetStateAction<string>>;
  handleSubscribe: () => Promise<void>;
  handleUnsubscribe: () => Promise<void>;
  startEditingSubscription: () => void;
  cancelEditingSubscription: () => void;
}

export function useEmailSubscription({
  realUserId,
  isOpen,
  onEmailSubscribed,
}: UseEmailSubscriptionParams): UseEmailSubscriptionReturn {
  const { showToast } = useToast();
  const { userInfo } = useUser();

  // State
  const [email, setEmail] = useState("");
  const [subscribedEmail, setSubscribedEmail] = useState<string | null>(null);
  const [isEditingSubscription, setIsEditingSubscription] = useState(false);
  const [subscriptionOperation, setSubscriptionOperation] =
    useState<OperationState>({
      isLoading: false,
      error: null,
    });

  // Operation state handlers
  const { setLoading, setSuccess, setError } = useOperationStateHandlers(
    setSubscriptionOperation
  );

  // Initialize subscription email from UserContext to avoid duplicate API calls
  useEffect(() => {
    if (!isOpen) return;
    const emailFromContext = userInfo?.email || null;
    if (emailFromContext) {
      setSubscribedEmail(emailFromContext);
      setEmail(emailFromContext);
      onEmailSubscribed?.();
    } else {
      setSubscribedEmail(null);
    }
  }, [isOpen, userInfo?.email, onEmailSubscribed]);

  // Handle email subscription
  const handleSubscribe = useCallback(async () => {
    if (!realUserId) {
      setError("User not authenticated");
      return;
    }

    // Validate email
    const validation = validateEmail(email);
    if (!validation.isValid) {
      setError(validation.error || "Invalid email address");
      return;
    }

    setLoading();

    try {
      await updateUserEmailSubscription(realUserId, email);

      setSuccess();
      setSubscribedEmail(email);
      setIsEditingSubscription(false);

      // Notify parent component of successful subscription
      onEmailSubscribed?.();

      showToast({
        type: "success",
        title: "Subscription updated",
        message: `You'll receive weekly PnL reports at ${email}.`,
      });
    } catch (error) {
      const errorMessage = handleWalletError(error);
      setError(errorMessage);
    }
  }, [
    realUserId,
    email,
    onEmailSubscribed,
    showToast,
    setLoading,
    setSuccess,
    setError,
  ]);

  // Unsubscribe (clear email)
  const handleUnsubscribe = useCallback(async () => {
    if (!realUserId) {
      setError("User not authenticated");
      return;
    }

    setLoading();

    try {
      // Use dedicated endpoint to remove email
      await unsubscribeUserEmail(realUserId);

      setSuccess();
      setSubscribedEmail(null);
      setEmail("");
      setIsEditingSubscription(false);

      showToast({
        type: "success",
        title: "Unsubscribed",
        message: "You will no longer receive weekly PnL reports.",
      });
    } catch (error) {
      const errorMessage = handleWalletError(error);
      setError(errorMessage);
    }
  }, [realUserId, showToast, setLoading, setSuccess, setError]);

  // Start editing subscription
  const startEditingSubscription = useCallback(() => {
    setIsEditingSubscription(true);
    if (subscribedEmail) {
      setEmail(subscribedEmail);
    }
  }, [subscribedEmail]);

  // Cancel editing subscription
  const cancelEditingSubscription = useCallback(() => {
    setIsEditingSubscription(false);
    if (subscribedEmail) {
      setEmail(subscribedEmail);
    }
    setSubscriptionOperation({ isLoading: false, error: null });
  }, [subscribedEmail]);

  return {
    // State
    email,
    subscribedEmail,
    isEditingSubscription,
    subscriptionOperation,

    // Actions
    setEmail,
    handleSubscribe,
    handleUnsubscribe,
    startEditingSubscription,
    cancelEditingSubscription,
  };
}
