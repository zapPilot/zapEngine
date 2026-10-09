import { useFundFlow } from '@/providers/FundFlowProvider';
import { SignBar } from '@/components/fund/SignBar';
import { NowPlayingBarHost } from './NowPlayingBarHost';
export function AppDock({ layout = 'bar' }: { layout?: 'bar' | 'card' }) {
  const fund = useFundFlow();
  return fund.available && fund.signRequest ? (
    <SignBar layout={layout} />
  ) : (
    <NowPlayingBarHost layout={layout} />
  );
}
