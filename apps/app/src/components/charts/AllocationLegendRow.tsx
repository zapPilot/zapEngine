import { tokenBrandSymbolFor } from '@zapengine/brand-assets';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { TokenIcon } from '@/components/token/TokenIcon';
import { resolveColor } from '@/lib/colors';

interface AllocationLegendRowProps {
  symbol?: string;
  color: string;
  label: string;
  value: ReactNode;
}

export function AllocationLegendRow({
  symbol,
  color,
  label,
  value,
}: AllocationLegendRowProps) {
  const brandedSymbol = symbol ? tokenBrandSymbolFor(symbol) : null;

  return (
    <View className="flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1 flex-row items-center gap-2">
        {brandedSymbol ? (
          <TokenIcon symbol={brandedSymbol} size={16} />
        ) : (
          <View
            className="h-[9px] w-[9px] shrink-0 rounded-full"
            style={{ backgroundColor: resolveColor(color) }}
          />
        )}
        <Text className="min-w-0 flex-1 text-[13px] text-ink-dim">{label}</Text>
      </View>
      {value}
    </View>
  );
}
