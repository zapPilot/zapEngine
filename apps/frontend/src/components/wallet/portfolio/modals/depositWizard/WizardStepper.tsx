import type { WizardStage } from '@zapengine/app-core/lib/wallet/depositWizardMachine';
import type { ReactElement } from 'react';

const STEPS: { stages: WizardStage[]; label: string }[] = [
  { stages: ['configure'], label: 'Configure' },
  { stages: ['sourceExecution'], label: 'Execute on Base' },
  { stages: ['bridging'], label: 'Bridge' },
  { stages: ['hyperliquidDeposit'], label: 'HLP Deposit' },
];

function stepIndexForStage(stage: WizardStage): number {
  if (stage === 'done') return STEPS.length;
  return STEPS.findIndex((step) => step.stages.includes(stage));
}

export function WizardStepper({ stage }: { stage: WizardStage }): ReactElement {
  const activeIndex = stepIndexForStage(stage);

  return (
    <ol className="flex items-center gap-2" data-testid="wizard-stepper">
      {STEPS.map((step, index) => {
        const status =
          index < activeIndex
            ? 'complete'
            : index === activeIndex
              ? 'active'
              : 'pending';
        return (
          <li
            key={step.label}
            className="flex items-center gap-2"
            data-testid={`wizard-step-${index + 1}`}
            data-status={status}
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                status === 'complete'
                  ? 'bg-emerald-500 text-white'
                  : status === 'active'
                    ? 'bg-purple-500 text-white'
                    : 'bg-gray-700 text-gray-400'
              }`}
            >
              {status === 'complete' ? '✓' : index + 1}
            </span>
            <span
              className={`text-xs ${
                status === 'active' ? 'text-white' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
            {index < STEPS.length - 1 && (
              <span className="h-px w-4 bg-gray-700" aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}
