/**
 * PerformanceTooltip - Portfolio
 */

import type { PerformanceHoverData } from '@/types/ui/chartHover';

import { TooltipRow } from './TooltipRow';
import { TooltipWrapper } from './TooltipWrapper';

export function PerformanceTooltip({ data }: { data: PerformanceHoverData }) {
  return (
    <TooltipWrapper date={data.date} spacing="tight">
      {/* Primary Metric */}
      <TooltipRow
        label="Portfolio Value"
        labelColor="text-purple-300"
        value={data.value}
        valueColor="text-white"
        format="currencyPrecise"
      />
    </TooltipWrapper>
  );
}
