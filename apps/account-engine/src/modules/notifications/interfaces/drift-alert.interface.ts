/**
 * Drift alert data structure for portfolio rebalancing notifications.
 */
export interface DriftAlertData {
  drift_percentage: number;
  wallet_address: string;
  recommendations: {
    action: 'buy' | 'sell';
    token: string;
    amount_usd: number;
    current_percent: number;
    target_percent: number;
  }[];
}
