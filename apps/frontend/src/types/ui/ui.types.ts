/**
 * UI Type Definitions
 *
 * Centralized, reusable type definitions for UI components to ensure consistency
 * across the application and eliminate type duplication. This module provides
 * standardized types for sizes, variants, colors, and common component props.
 *
 * Used across 50+ components in the codebase for consistent typing and behavior.
 *
 * @module types/ui
 * @version 2.0.0
 */

import type { AllocationBreakdown } from '@/types/domain/allocation';

// =============================================================================
// SIZE TYPES
// =============================================================================

/**
 * Standard size variants for UI components.
 * Used across buttons, inputs, loaders, cards, icons, and other interactive elements.
 *
 * Size mapping guidelines:
 * - `xs`: Extra small (12-16px height, minimal padding)
 * - `sm`: Small (24-32px height, compact padding)
 * - `md`: Medium (40-48px height, standard padding) - DEFAULT
 * - `lg`: Large (48-56px height, generous padding)
 * - `xl`: Extra large (56-64px height, maximum padding)
 *
 * @example
 * ```tsx
 * <Button size="md">Click me</Button>
 * <Spinner size="lg" />
 * <Input size="sm" />
 * ```
 */
export type ComponentSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// =============================================================================
// VARIANT TYPES
// =============================================================================

// ButtonVariant type removed - unused (2025-12-22)

/**
 * Loading display variants for different UI contexts.
 * Controls how loading states are presented to users.
 *
 * Variant Selection Guide:
 * - `spinner`: Use for active operations (API calls, transactions)
 * - `card`: Use for loading entire card/section content
 * - `skeleton`: Use for progressive content loading
 * - `inline`: Use for in-text or inline element loading
 *
 * @example
 * ```tsx
 * <LoadingState variant="spinner" message="Processing transaction..." />
 * <LoadingState variant="card" />
 * <LoadingState variant="skeleton" skeletonType="chart" />
 * <LoadingState variant="inline" size="sm" />
 * ```
 */
export type LoadingVariant = 'spinner' | 'card' | 'skeleton' | 'inline';

/**
 * Spinner animation variants for visual loading indicators.
 *
 * Performance Note: All variants are GPU-accelerated for smooth 60fps animation.
 *
 * - `default`: Standard rotating circle (universal, accessible)
 * - `dots`: Bouncing dots animation (playful, less formal)
 * - `pulse`: Pulsing circle animation (subtle, minimal)
 *
 * @example
 * ```tsx
 * <Spinner variant="default" size="md" />
 * <Spinner variant="dots" color="primary" />
 * <Spinner variant="pulse" size="lg" />
 * ```
 */
export type SpinnerVariant = 'default' | 'dots' | 'pulse';

/**
 * Skeleton shape variants for placeholder content during loading.
 *
 * Accessibility: All skeletons include proper ARIA labels and role="status".
 *
 * Shape Guidelines:
 * - `text`: Text line placeholders (supports multiple lines)
 * - `circular`: Circular placeholders (avatars, profile pictures, icons)
 * - `rectangular`: Rectangular placeholders (images, cards, media)
 * - `rounded`: Rounded rectangle placeholders (buttons, badges, chips)
 *
 * @example
 * ```tsx
 * <Skeleton variant="circular" width="40px" height="40px" />
 * <Skeleton variant="text" lines={3} spacing="mb-2" />
 * <Skeleton variant="rectangular" width="100%" height="200px" />
 * <Skeleton variant="rounded" width="120px" height="40px" />
 * ```
 */
export type SkeletonVariant = 'text' | 'circular' | 'rectangular' | 'rounded';

// =============================================================================
// BASE COMPONENT PROPS
// =============================================================================

/**
 * Standard props included in all UI components.
 * Provides baseline functionality for styling and testing.
 *
 * @example
 * ```tsx
 * interface MyComponentProps extends BaseComponentProps {
 *   title: string;
 * }
 *
 * function MyComponent({ className, testId, title }: MyComponentProps) {
 *   return <div className={className} data-testid={testId}>{title}</div>;
 * }
 * ```
 */
export interface BaseComponentProps {
  /**
   * Additional CSS classes to apply to the component.
   * Merged with component's default classes.
   */
  className?: string;

  /**
   * Test identifier for automated testing.
   * Used with `data-testid` attribute.
   */
  testId?: string;
}

/**
 * Props for interactive components (buttons, links, inputs).
 * Extends BaseComponentProps with interaction states.
 *
 * @example
 * ```tsx
 * interface ButtonProps extends InteractiveComponentProps {
 *   onClick: () => void;
 * }
 *
 * function Button({ disabled, loading, onClick }: ButtonProps) {
 *   return (
 *     <button disabled={disabled || loading} onClick={onClick}>
 *       {loading ? 'Loading...' : 'Click me'}
 *     </button>
 *   );
 * }
 * ```
 */
export interface InteractiveComponentProps extends BaseComponentProps {
  /**
   * Disabled state for the component.
   * When true, the component cannot be interacted with.
   */
  disabled?: boolean;

  /**
   * Loading state for the component.
   * When true, the component shows loading indicator.
   */
  loading?: boolean;
}

// NOTE: Type guards (isComponentSize, isButtonVariant, isLoadingVariant) and
// constants (DEFAULT_SIZES, DEFAULT_VARIANTS, SIZE_ORDER) removed as dead code
// (2025-12-22). Add back if needed.

// =============================================================================
// TRANSACTION MODAL PROPS
// =============================================================================

/**
 * Base props shared by all transaction modals.
 */
export interface BaseTransactionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Props for the deposit modal.
 */
export interface DepositModalProps extends BaseTransactionModalProps {
  defaultChainId?: number;
}

/**
 * Props for the withdraw modal.
 */
export interface WithdrawModalProps extends BaseTransactionModalProps {
  defaultChainId?: number;
}

/**
 * Props for the rebalance modal.
 */
export interface RebalanceModalProps extends BaseTransactionModalProps {
  currentAllocation: AllocationBreakdown;
  targetAllocation: AllocationBreakdown;
}

// =============================================================================
// SWAP TOKEN
// =============================================================================

export interface SwapToken {
  symbol: string;
  name: string;
  address: string;
  chainId: number;
  decimals: number;
  balance?: number;
  price?: number;
  logo_url?: string;
  optimized_symbol?: string;
  icon?: string;
  type?: 'native' | 'wrapped' | 'erc20';
  wrappedVersion?: string;
  nativeVersion?: string;
  hasDeposit?: boolean;
}
