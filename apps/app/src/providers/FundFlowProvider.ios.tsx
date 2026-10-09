import type { ReactNode } from 'react';
import type { FundFlowValue } from './FundFlowProvider';
const UNAVAILABLE: FundFlowValue = {
  available: false,
  visible: false,
  step: 'amount',
  signRequest: null,
  open: () => undefined,
  close: () => undefined,
};
export function FundFlowProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
export function useFundFlow() {
  return UNAVAILABLE;
}
