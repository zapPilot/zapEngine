import { Text, View } from 'react-native';

import { PrimaryButton } from '@/components/ui/PrimaryButton';

interface WizardErrorCardProps {
  message: string;
  onDismiss: () => void;
}

/** Execution error surface with a dismiss CTA (clears wizard.error). */
export function WizardErrorCard({ message, onDismiss }: WizardErrorCardProps) {
  return (
    <View
      className="rounded-2xl border p-4"
      style={{
        backgroundColor: 'rgba(255,111,97,.08)',
        borderColor: 'rgba(255,111,97,.35)',
      }}
    >
      <Text className="font-sans-semibold text-[13.5px] text-[#ff6f61]">
        Something went wrong
      </Text>
      <Text className="mt-1.5 text-[12.5px] leading-[18px] text-ink-dim">
        {message}
      </Text>
      <PrimaryButton className="mt-4" variant="secondary" onPress={onDismiss}>
        Dismiss
      </PrimaryButton>
    </View>
  );
}
