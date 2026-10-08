import { tokens } from '@zapengine/design-tokens/tokens';
import { Icon } from '@/components/ui/Icon';
import { CHAIN_BRAND } from '@zapengine/brand-assets/chains';
import { Lock } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { ProtocolIcon } from '@/components/token/ProtocolIcon';
import { Disclosure } from '@/components/ui/Disclosure';
import { InvestLineItem } from '@/components/invest/InvestLineItem';
import { sectorColor } from '@/components/invest/sectorColors';
import type { InvestSector } from '@/integration/investSectorModel';
import {
  INVEST_POSITIONS,
  type InvestPositionId,
} from '@/integration/investTargetsModel';
import { formatUsd6 } from '@/lib/format';
export interface SectorPositionBreakdownRow {
  positionId: InvestPositionId;
  intraBps: number;
  usd6: bigint | null;
}
export function SectorCard({
  sector,
  percentInput,
  positions,
  totalUsd6,
  onChangePercent,
  onBlurPercent,
}: {
  sector: InvestSector;
  percentInput: string;
  positions: SectorPositionBreakdownRow[];
  totalUsd6?: bigint | null;
  onChangePercent?: (value: string) => void;
  onBlurPercent?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const total =
    totalUsd6 !== undefined
      ? totalUsd6
      : positions.some((p) => p.usd6 === null)
        ? null
        : positions.reduce((n, p) => n + (p.usd6 ?? 0n), 0n);
  return (
    <View
      className="rounded-panel border border-rule bg-well p-4"
      accessibilityState={{ disabled: !sector.executable }}
      aria-disabled={!sector.executable}
      accessibilityLabel={
        !sector.executable
          ? `${sector.label}, 0%. ${sector.lockedReason}`
          : undefined
      }
    >
      <View className="flex-row items-center gap-2">
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: tokens.radius.control,
            backgroundColor: sectorColor(sector),
          }}
        />
        <Text className="flex-1 font-text-semibold text-body text-ink">
          {sector.label}
        </Text>
        {sector.executable ? (
          <>
            <TextInput
              accessibilityLabel={`${sector.label} allocation percentage`}
              accessibilityHint="Other sectors adjust automatically so the total stays at 100%"
              className="w-16 text-right font-mono text-data-md text-ink"
              keyboardType="decimal-pad"
              value={percentInput}
              onChangeText={onChangePercent}
              onBlur={onBlurPercent}
            />
            <Text className="font-text text-ink-2">%</Text>
          </>
        ) : (
          <>
            <Icon icon={Lock} size="xs" tone="default" />
            <Text className="font-mono text-ink-3">0%</Text>
          </>
        )}
      </View>
      <Text className="font-mono-medium mt-2 text-label text-ink-2">
        {sector.description}
      </Text>
      {sector.executable ? (
        <>
          <Text className="mt-3 font-mono text-data text-ink">
            {total === null ? '—' : formatUsd6(total)}
          </Text>
          <Disclosure
            expanded={expanded}
            onToggle={() => setExpanded((v) => !v)}
            accessibilityLabel={`${sector.label} details`}
            header={
              <Text className="font-mono-medium flex-1 text-label text-ink-2">
                Details
              </Text>
            }
          >
            {positions.map((p) => {
              const position = INVEST_POSITIONS.find(
                (x) => x.id === p.positionId,
              )!;
              return (
                <InvestLineItem
                  key={p.positionId}
                  icon={<ProtocolIcon protocol={position.protocol} />}
                  title={position.venue}
                  subtitle={`${CHAIN_BRAND[position.chainKey].label} · ${p.intraBps / 100}% of ${sector.label}`}
                  value={p.usd6 === null ? '—' : formatUsd6(p.usd6)}
                  divider
                />
              );
            })}
          </Disclosure>
        </>
      ) : (
        <Text className="font-mono-medium mt-3 text-label leading-4 text-ink-3">
          {sector.lockedReason}
        </Text>
      )}
    </View>
  );
}
