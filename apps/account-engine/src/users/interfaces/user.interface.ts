import { Database } from '@db-types/database.types';

// Type aliases using database types as single source of truth
export type User = Database['public']['Tables']['users']['Row'];
export type UserCryptoWallet =
  Database['public']['Tables']['user_crypto_wallets']['Row'];
export type Plan = Database['public']['Tables']['plans']['Row'];
export type UserSubscription =
  Database['public']['Tables']['user_subscriptions']['Row'];

// Response type definitions
export interface SuccessResponse {
  success: boolean;
  message: string;
}

// Specific response types
export interface ConnectWalletResponse {
  user_id: string;
  is_new_user: boolean;
  plan_code?: string;
  etl_job?: EtlJobResponse;
}

export interface AddWalletResponse {
  wallet_id: string;
  message: string;
}
export interface UpdateEmailResponse extends SuccessResponse {
  email_updated: boolean;
  plan_upgraded: boolean;
}
export type UpdateWalletLabelResponse = SuccessResponse;

export interface UserProfileResponse {
  user: User;
  wallets: UserCryptoWallet[];
  subscription?: UserSubscription & { plan: Plan };
}

// ETL Job response types
export interface EtlJobResponse {
  job_id: string | null;
  status: string;
  message: string;
  rate_limited?: boolean;
}
