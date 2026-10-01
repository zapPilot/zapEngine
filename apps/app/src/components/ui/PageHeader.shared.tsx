import type { ReactNode, ReactElement } from 'react';
import { ArrowLeft, X } from 'lucide-react-native';
import { View } from 'react-native';
import { Text } from './Text';
import { IconButton } from './IconButton';
import { BrandLockup } from './BrandLockup';
import { cn } from '@/lib/cn';
interface HeaderContent {
  title: string;
  mode?: 'root' | 'stack' | 'wizard';
  brand?: boolean;
  leading?: ReactNode;
  actions?: ReactNode;
  step?: string;
  className?: string;
}
export type PageHeaderProps = HeaderContent &
  (
    | { onBack: () => void; backLabel: string }
    | { onBack?: never; backLabel?: never }
  ) &
  (
    | { onClose: () => void; closeLabel: string }
    | { onClose?: never; closeLabel?: never }
  );
export function PageHeader({
  title,
  mode = 'root',
  brand = false,
  leading,
  actions,
  step,
  className,
  onBack,
  backLabel,
  onClose,
  closeLabel,
}: PageHeaderProps): ReactElement {
  return (
    <View
      className={cn(
        'flex-row items-center justify-between gap-3 px-5 py-3',
        className,
      )}
    >
      <View className="min-w-0 flex-1 flex-row items-center gap-3">
        {onBack && backLabel ? (
          <IconButton
            icon={ArrowLeft}
            onPress={onBack}
            accessibilityLabel={backLabel}
          />
        ) : (
          leading
        )}
        <View className="min-w-0 flex-1">
          {brand ? (
            <BrandLockup heading={1} />
          ) : (
            <Text variant={mode === 'wizard' ? 'heading' : 'title'} heading={1}>
              {title}
            </Text>
          )}
          {step ? (
            <Text variant="overline" tone="muted" className="mt-1">
              {step}
            </Text>
          ) : null}
        </View>
      </View>
      {actions}
      {onClose && closeLabel ? (
        <IconButton
          icon={X}
          onPress={onClose}
          accessibilityLabel={closeLabel}
        />
      ) : null}
    </View>
  );
}
