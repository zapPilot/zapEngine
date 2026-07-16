import { Linking, Text, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Pill } from '@/components/ui/Pill';
import { Tap } from '@/components/ui/Tap';
import type { WizardLegRow } from '@/integration/investExecutionModel';

const TONE_CLASSES = {
  neutral: 'bg-[rgba(255,255,255,.06)]',
  success: 'bg-[rgba(122,216,143,.14)]',
  error: 'bg-[rgba(255,111,97,.14)]',
} as const;

function TxLink({ label, url }: { label: string; url: string }) {
  return (
    <Tap onPress={() => void Linking.openURL(url)}>
      <Text className="text-[12px] text-accent underline">{label}</Text>
    </Tap>
  );
}

export function WizardLegList({ rows }: { rows: WizardLegRow[] }) {
  return (
    <Card className="p-4">
      {rows.map((row, index) => (
        <View
          key={row.id}
          className={index > 0 ? 'mt-3 border-t border-line pt-3' : ''}
        >
          <View className="flex-row items-center gap-2.5">
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: row.dotColor }}
            />
            <Text className="flex-1 text-[13.5px] text-ink">{row.title}</Text>
            <Pill className={TONE_CLASSES[row.statusTone]}>
              {row.statusLabel}
            </Pill>
          </View>
          {row.sourceTxUrl || row.destinationTxUrl ? (
            <View className="mt-1.5 flex-row gap-4 pl-[18px]">
              {row.sourceTxUrl ? (
                <TxLink label="Source tx" url={row.sourceTxUrl} />
              ) : null}
              {row.destinationTxUrl ? (
                <TxLink label="Destination tx" url={row.destinationTxUrl} />
              ) : null}
            </View>
          ) : null}
        </View>
      ))}
    </Card>
  );
}
