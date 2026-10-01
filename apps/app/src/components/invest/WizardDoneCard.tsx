import { Card } from '@/components/ui/Card';
import { ListRow } from '@/components/ui/ListRow';
import { Button } from '@/components/ui/Button';

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
        <ListRow title="Amount" value={amountLabel} divider />
        <ListRow title="Status" value={statusLabel} />
      </Card>
      <Button className="mt-5" onPress={onDone}>
        Back to home
      </Button>
    </>
  );
}
