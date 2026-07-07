import { Card } from '@/components/ui/Card';
import { InfoRow } from '@/components/ui/InfoRow';
import { PrimaryButton } from '@/components/ui/PrimaryButton';

interface WizardDoneCardProps {
  amountLabel: string;
  statusLabel: string;
  onDone: () => void;
}

/** Completion summary + exit CTA for the execution progress screen. */
export function WizardDoneCard({
  amountLabel,
  statusLabel,
  onDone,
}: WizardDoneCardProps) {
  return (
    <>
      <Card className="mt-4 p-4">
        <InfoRow label="Amount" value={amountLabel} divider />
        <InfoRow label="Status" value={statusLabel} />
      </Card>
      <PrimaryButton className="mt-5" onPress={onDone}>
        Back to home
      </PrimaryButton>
    </>
  );
}
