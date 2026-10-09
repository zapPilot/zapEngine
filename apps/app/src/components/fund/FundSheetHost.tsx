import { useEffect, useRef } from 'react';
import { useToast } from '@zapengine/app-core/providers/ToastContext';
import { shouldOfferAgentEnable } from '@/integration/hlpProgressModel';
import { useInvestExecution } from '@/integration/useInvestExecution';
import {
  useFundFlow,
  useFundControllerState,
} from '@/providers/FundFlowProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
import { FundAmountStep } from './FundAmountStep';
import { FundReviewStep } from './FundReviewStep';
import { FundProgressStep } from './FundProgressStep';
import { useFundExecutionController } from './useFundExecutionController';
function ExecutionDriver({ visible }: { visible: boolean }) {
  const c = useFundExecutionController({ visible });
  const { report } = useFundControllerState();
  const { t } = useContentLanguage();
  const { showToast } = useToast();
  const completed = useRef(false);
  const needsAgent = shouldOfferAgentEnable(c.hlpModel);
  useEffect(
    () => report({ complete: c.routeComplete, needsAgent }),
    [report, c.routeComplete, needsAgent],
  );
  useEffect(() => {
    if (c.routeComplete && !completed.current && !visible)
      showToast({
        type: 'info',
        title: t('fund.complete'),
        message: t('fund.completeBody'),
      });
    completed.current = c.routeComplete;
  }, [c.routeComplete, visible, showToast, t]);
  // The controller is above the Modal. Closing the sheet does not stop tracking.
  return <FundProgressStep controller={c} />;
}
export function FundSheetHost() {
  const fund = useFundFlow();
  const state = useFundControllerState();
  const execution = useInvestExecution();
  if (state.ownerValid && execution.reviewedProgress !== null)
    return <ExecutionDriver key={state.ownerKey} visible={fund.visible} />;
  if (!fund.visible) return null;
  return fund.step === 'amount' ? <FundAmountStep /> : <FundReviewStep />;
}
