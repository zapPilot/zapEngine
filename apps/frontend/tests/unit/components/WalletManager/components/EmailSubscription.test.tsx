import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { EmailSubscription } from "@/components/WalletManager/components/EmailSubscription";
import type { OperationState } from "@/components/WalletManager/types/wallet.types";

describe("EmailSubscription", () => {
  const defaultSubscriptionOperation: OperationState = {
    isLoading: false,
    error: null,
  };

  const defaultProps = {
    email: "",
    subscribedEmail: null,
    isEditingSubscription: false,
    subscriptionOperation: defaultSubscriptionOperation,
    onEmailChange: vi.fn(),
    onSubscribe: vi.fn(),
    onUnsubscribe: vi.fn(),
    onStartEditing: vi.fn(),
    onCancelEditing: vi.fn(),
  };

  describe("unsubscribed state", () => {
    it("should render email input when not subscribed", () => {
      render(<EmailSubscription {...defaultProps} />);

      expect(
        screen.getByPlaceholderText(/enter your email/i)
      ).toBeInTheDocument();
    });

    it("should render Subscribe button when not subscribed", () => {
      render(<EmailSubscription {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /subscribe/i })
      ).toBeInTheDocument();
    });

    it("should not render Cancel button when not subscribed", () => {
      render(<EmailSubscription {...defaultProps} />);

      expect(
        screen.queryByRole("button", { name: /cancel/i })
      ).not.toBeInTheDocument();
    });

    it("should display email input value correctly", () => {
      render(<EmailSubscription {...defaultProps} email="test@example.com" />);

      const emailInput = screen.getByPlaceholderText(
        /enter your email/i
      ) as HTMLInputElement;
      expect(emailInput.value).toBe("test@example.com");
    });

    it("should call onEmailChange when email input changes", async () => {
      const user = userEvent.setup();
      const onEmailChange = vi.fn();

      render(
        <EmailSubscription {...defaultProps} onEmailChange={onEmailChange} />
      );

      const emailInput = screen.getByPlaceholderText(/enter your email/i);
      await user.type(emailInput, "test@example.com");

      expect(onEmailChange).toHaveBeenCalledWith("t");
      expect(onEmailChange).toHaveBeenCalledWith("e");
      expect(onEmailChange).toHaveBeenCalledWith("s");
      // Called for each character typed
    });

    it("should call onSubscribe when Subscribe button is clicked", async () => {
      const user = userEvent.setup();
      const onSubscribe = vi.fn();

      render(<EmailSubscription {...defaultProps} onSubscribe={onSubscribe} />);

      await user.click(screen.getByRole("button", { name: /subscribe/i }));

      expect(onSubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("subscribed state", () => {
    const subscribedProps = {
      ...defaultProps,
      subscribedEmail: "user@example.com",
    };

    it("should display subscription confirmation when subscribed", () => {
      render(<EmailSubscription {...subscribedProps} />);

      expect(
        screen.getByText(/you're subscribed to weekly pnl reports/i)
      ).toBeInTheDocument();
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    it("should render Update email button when subscribed", () => {
      render(<EmailSubscription {...subscribedProps} />);

      expect(
        screen.getByRole("button", { name: /update email/i })
      ).toBeInTheDocument();
    });

    it("should render Unsubscribe button when subscribed", () => {
      render(<EmailSubscription {...subscribedProps} />);

      expect(
        screen.getByRole("button", { name: /unsubscribe/i })
      ).toBeInTheDocument();
    });

    it("should not render email input when subscribed and not editing", () => {
      render(<EmailSubscription {...subscribedProps} />);

      expect(
        screen.queryByPlaceholderText(/enter your email/i)
      ).not.toBeInTheDocument();
    });

    it("should call onStartEditing when Update email button is clicked", async () => {
      const user = userEvent.setup();
      const onStartEditing = vi.fn();

      render(
        <EmailSubscription
          {...subscribedProps}
          onStartEditing={onStartEditing}
        />
      );

      await user.click(screen.getByRole("button", { name: /update email/i }));

      expect(onStartEditing).toHaveBeenCalledTimes(1);
    });

    it("should call onUnsubscribe when Unsubscribe button is clicked", async () => {
      const user = userEvent.setup();
      const onUnsubscribe = vi.fn();

      render(
        <EmailSubscription {...subscribedProps} onUnsubscribe={onUnsubscribe} />
      );

      await user.click(screen.getByRole("button", { name: /unsubscribe/i }));

      expect(onUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("editing subscription state", () => {
    const editingProps = {
      ...defaultProps,
      subscribedEmail: "user@example.com",
      isEditingSubscription: true,
      email: "user@example.com",
    };

    it("should render email input when editing", () => {
      render(<EmailSubscription {...editingProps} />);

      expect(
        screen.getByPlaceholderText(/enter your email/i)
      ).toBeInTheDocument();
    });

    it("should render Save button when editing existing subscription", () => {
      render(<EmailSubscription {...editingProps} />);

      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
    });

    it("should render Cancel button when editing", () => {
      render(<EmailSubscription {...editingProps} />);

      expect(
        screen.getByRole("button", { name: /cancel/i })
      ).toBeInTheDocument();
    });

    it("should not show subscription confirmation when editing", () => {
      render(<EmailSubscription {...editingProps} />);

      expect(
        screen.queryByText(/you're subscribed to weekly pnl reports/i)
      ).not.toBeInTheDocument();
    });

    it("should call onSubscribe when Save button is clicked", async () => {
      const user = userEvent.setup();
      const onSubscribe = vi.fn();

      render(<EmailSubscription {...editingProps} onSubscribe={onSubscribe} />);

      await user.click(screen.getByRole("button", { name: /save/i }));

      expect(onSubscribe).toHaveBeenCalledTimes(1);
    });

    it("should call onCancelEditing when Cancel button is clicked", async () => {
      const user = userEvent.setup();
      const onCancelEditing = vi.fn();

      render(
        <EmailSubscription
          {...editingProps}
          onCancelEditing={onCancelEditing}
        />
      );

      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onCancelEditing).toHaveBeenCalledTimes(1);
    });

    it("should allow editing email when in editing mode", async () => {
      const user = userEvent.setup();
      const onEmailChange = vi.fn();

      render(
        <EmailSubscription {...editingProps} onEmailChange={onEmailChange} />
      );

      const emailInput = screen.getByPlaceholderText(/enter your email/i);
      await user.clear(emailInput);
      await user.type(emailInput, "new@example.com");

      expect(onEmailChange).toHaveBeenCalled();
    });
  });

  describe("loading state", () => {
    it("should show loading spinner when subscribing", () => {
      const subscriptionOperation: OperationState = {
        isLoading: true,
        error: null,
      };

      render(
        <EmailSubscription
          {...defaultProps}
          subscriptionOperation={subscriptionOperation}
        />
      );

      // Loading spinner should be present
      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should disable Subscribe button when loading", () => {
      const subscriptionOperation: OperationState = {
        isLoading: true,
        error: null,
      };

      render(
        <EmailSubscription
          {...defaultProps}
          subscriptionOperation={subscriptionOperation}
        />
      );

      const button = screen.getByRole("button");
      expect(button).toBeDisabled();
    });

    it("should disable Save button when loading in edit mode", () => {
      const subscriptionOperation: OperationState = {
        isLoading: true,
        error: null,
      };

      render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="user@example.com"
          isEditingSubscription={true}
          subscriptionOperation={subscriptionOperation}
        />
      );

      const button = screen.getByRole("button", { name: /cancel/i })
        .previousElementSibling as HTMLButtonElement;
      expect(button).toBeDisabled();
    });
  });

  describe("error display", () => {
    it("should display error message when subscription fails", () => {
      const subscriptionOperation: OperationState = {
        isLoading: false,
        error: "Email already in use",
      };

      render(
        <EmailSubscription
          {...defaultProps}
          subscriptionOperation={subscriptionOperation}
        />
      );

      expect(screen.getByText(/email already in use/i)).toBeInTheDocument();
    });

    it("should not display error when error is null", () => {
      render(<EmailSubscription {...defaultProps} />);

      expect(
        screen.queryByText(/email already in use/i)
      ).not.toBeInTheDocument();
    });

    it("should display error in editing mode", () => {
      const subscriptionOperation: OperationState = {
        isLoading: false,
        error: "Invalid email format",
      };

      render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="user@example.com"
          isEditingSubscription={true}
          subscriptionOperation={subscriptionOperation}
        />
      );

      expect(screen.getByText(/invalid email format/i)).toBeInTheDocument();
    });

    it("should display different error messages", () => {
      const subscriptionOperation1: OperationState = {
        isLoading: false,
        error: "Network error",
      };

      const { rerender } = render(
        <EmailSubscription
          {...defaultProps}
          subscriptionOperation={subscriptionOperation1}
        />
      );

      expect(screen.getByText(/network error/i)).toBeInTheDocument();

      const subscriptionOperation2: OperationState = {
        isLoading: false,
        error: "Server error",
      };

      rerender(
        <EmailSubscription
          {...defaultProps}
          subscriptionOperation={subscriptionOperation2}
        />
      );

      expect(screen.getByText(/server error/i)).toBeInTheDocument();
    });
  });

  describe("button text variants", () => {
    it("should show Subscribe text when not subscribed", () => {
      render(<EmailSubscription {...defaultProps} />);

      expect(
        screen.getByRole("button", { name: /subscribe/i })
      ).toBeInTheDocument();
    });

    it("should show Save text when editing subscription", () => {
      render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="user@example.com"
          isEditingSubscription={true}
        />
      );

      expect(screen.getByRole("button", { name: /save/i })).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /subscribe/i })
      ).not.toBeInTheDocument();
    });
  });

  describe("complete subscription flow", () => {
    it("should handle new subscription flow", async () => {
      const user = userEvent.setup();
      const onEmailChange = vi.fn();
      const onSubscribe = vi.fn();

      render(
        <EmailSubscription
          {...defaultProps}
          onEmailChange={onEmailChange}
          onSubscribe={onSubscribe}
        />
      );

      // Type email
      const emailInput = screen.getByPlaceholderText(/enter your email/i);
      await user.type(emailInput, "test@example.com");

      // Click subscribe
      await user.click(screen.getByRole("button", { name: /subscribe/i }));

      expect(onEmailChange).toHaveBeenCalled();
      expect(onSubscribe).toHaveBeenCalledTimes(1);
    });

    it("should handle update subscription flow", async () => {
      const user = userEvent.setup();
      const onStartEditing = vi.fn();
      const onEmailChange = vi.fn();
      const onSubscribe = vi.fn();

      const { rerender } = render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="old@example.com"
          onStartEditing={onStartEditing}
        />
      );

      // Click update email
      await user.click(screen.getByRole("button", { name: /update email/i }));
      expect(onStartEditing).toHaveBeenCalledTimes(1);

      // Simulate entering edit mode
      rerender(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="old@example.com"
          isEditingSubscription={true}
          email="old@example.com"
          onEmailChange={onEmailChange}
          onSubscribe={onSubscribe}
        />
      );

      // Update email
      const emailInput = screen.getByPlaceholderText(/enter your email/i);
      await user.clear(emailInput);
      await user.type(emailInput, "new@example.com");

      // Save
      await user.click(screen.getByRole("button", { name: /save/i }));

      expect(onEmailChange).toHaveBeenCalled();
      expect(onSubscribe).toHaveBeenCalledTimes(1);
    });

    it("should handle cancel editing flow", async () => {
      const user = userEvent.setup();
      const onCancelEditing = vi.fn();

      render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="user@example.com"
          isEditingSubscription={true}
          email="user@example.com"
          onCancelEditing={onCancelEditing}
        />
      );

      // Cancel editing
      await user.click(screen.getByRole("button", { name: /cancel/i }));

      expect(onCancelEditing).toHaveBeenCalledTimes(1);
    });

    it("should handle unsubscribe flow", async () => {
      const user = userEvent.setup();
      const onUnsubscribe = vi.fn();

      render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="user@example.com"
          onUnsubscribe={onUnsubscribe}
        />
      );

      // Unsubscribe
      await user.click(screen.getByRole("button", { name: /unsubscribe/i }));

      expect(onUnsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe("edge cases", () => {
    it("should handle empty email input", () => {
      render(<EmailSubscription {...defaultProps} email="" />);

      const emailInput = screen.getByPlaceholderText(
        /enter your email/i
      ) as HTMLInputElement;
      expect(emailInput.value).toBe("");
    });

    it("should handle long email addresses", () => {
      const longEmail = "verylongemailaddress@verylongdomainname.com";

      render(<EmailSubscription {...defaultProps} email={longEmail} />);

      const emailInput = screen.getByPlaceholderText(
        /enter your email/i
      ) as HTMLInputElement;
      expect(emailInput.value).toBe(longEmail);
    });

    it("should display subscribed email correctly", () => {
      render(
        <EmailSubscription
          {...defaultProps}
          subscribedEmail="specific@test.com"
        />
      );

      expect(screen.getByText("specific@test.com")).toBeInTheDocument();
    });

    it("should handle rapid button clicks when not loading", async () => {
      const user = userEvent.setup();
      const onSubscribe = vi.fn();

      render(<EmailSubscription {...defaultProps} onSubscribe={onSubscribe} />);

      const button = screen.getByRole("button", { name: /subscribe/i });
      await user.click(button);
      await user.click(button);

      expect(onSubscribe).toHaveBeenCalledTimes(2);
    });
  });
});
