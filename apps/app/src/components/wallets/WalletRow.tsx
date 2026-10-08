import { tokens } from '@zapengine/design-tokens/tokens';
import { palette } from '@/lib/palette';
import { Icon, type IconProps } from '@/components/ui/Icon';
import { Copy, Pencil, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Badge } from '@/components/ui/Badge';
import { Tap } from '@/components/ui/Tap';
import type { WalletRowVM } from '@/integration/walletManagerModel';
import { truncateAddress } from '@/lib/format';

interface WalletRowProps {
  row: WalletRowVM;
  divider: boolean;
  isRemoving: boolean;
  removeError: string | null;
  editError: string | null;
  isVerifying: boolean;
  verifyError: string | null;
  onCopy: (address: string) => void;
  onSaveLabel: (walletId: string, newLabel: string) => void;
  onDelete: (walletId: string) => void;
  onVerify: (walletAddress: string) => void;
}

type RowMode = 'view' | 'edit' | 'confirm-remove';

function IconAction({
  label,
  onPress,
  disabled,
  icon,
  tone = 'secondary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon: IconProps['icon'];
  tone?: IconProps['tone'];
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="h-8 w-8 items-center justify-center rounded-round border border-rule bg-well"
      disabled={disabled}
      onPress={onPress}
    >
      <Icon icon={icon} size="xs" tone={tone} />
    </Tap>
  );
}

function InlineActionButton({
  label,
  tone = 'default',
  disabled,
  onPress,
}: {
  label: string;
  tone?: 'default' | 'alert';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-round border px-3 py-1.5"
      style={{
        borderColor: tone === 'alert' ? palette.alert : palette['sign-ink'],
        backgroundColor:
          tone === 'alert' ? palette['alert-wash'] : palette['sign-wash'],
        opacity: disabled ? 0.5 : 1,
      }}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className="font-text-semibold text-label"
        style={{
          color: tone === 'alert' ? palette.alert : palette['sign-ink'],
        }}
      >
        {label}
      </Text>
    </Tap>
  );
}

/** One bundle wallet with inline label editing and two-step remove confirm. */
export function WalletRow({
  row,
  divider,
  isRemoving,
  removeError,
  editError,
  isVerifying,
  verifyError,
  onCopy,
  onSaveLabel,
  onDelete,
  onVerify,
}: WalletRowProps) {
  const [mode, setMode] = useState<RowMode>('view');
  const [labelDraft, setLabelDraft] = useState(row.label);

  const inlineError = removeError ?? editError ?? verifyError;

  return (
    <View
      className="px-1 py-3"
      style={
        divider
          ? {
              borderBottomWidth: 1,
              borderBottomColor: tokens.mode.night['rule-2'],
            }
          : null
      }
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            {mode === 'edit' ? (
              <TextInput
                className="min-w-0 flex-1 rounded-panel border border-rule bg-well px-3 py-2 font-text-semibold text-body-sm text-ink"
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="Wallet label"
                placeholderTextColor="#52525b"
                value={labelDraft}
                onChangeText={setLabelDraft}
              />
            ) : (
              <>
                <Text
                  className="font-text-semibold text-body text-ink"
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                {row.isActive ? (
                  <Badge className="bg-well">
                    <Text className="font-mono text-data uppercase tracking-[0.5px] text-ink">
                      Active
                    </Text>
                  </Badge>
                ) : null}
                {!row.isVerified ? (
                  <Badge className="bg-sign-wash">
                    <Text className="font-mono text-data uppercase tracking-[0.5px] text-ink">
                      Unverified
                    </Text>
                  </Badge>
                ) : null}
              </>
            )}
          </View>
          <Text className="mt-1 font-mono text-data text-ink">
            {truncateAddress(row.address)}
          </Text>
        </View>

        {mode === 'view' ? (
          <View className="flex-row items-center gap-1.5">
            {row.canVerify ? (
              <InlineActionButton
                label={isVerifying ? 'Waiting for signature…' : 'Verify'}
                disabled={isVerifying}
                onPress={() => onVerify(row.address)}
              />
            ) : null}
            <IconAction
              label={`Copy ${row.label} address`}
              onPress={() => onCopy(row.address)}
              icon={Copy}
            />
            <IconAction
              label={`Edit ${row.label} label`}
              onPress={() => {
                setLabelDraft(row.label);
                setMode('edit');
              }}
              icon={Pencil}
            />
            <IconAction
              label={`Remove ${row.label} from bundle`}
              onPress={() => setMode('confirm-remove')}
              icon={Trash2}
              tone="alert"
            />
          </View>
        ) : null}

        {mode === 'edit' ? (
          <View className="flex-row items-center gap-1.5">
            <InlineActionButton
              label="Save"
              onPress={() => {
                onSaveLabel(row.id, labelDraft.trim());
                setMode('view');
              }}
            />
            <InlineActionButton
              label="Cancel"
              onPress={() => setMode('view')}
            />
          </View>
        ) : null}
      </View>

      {mode === 'confirm-remove' ? (
        <View className="mt-2 flex-row items-center gap-2 rounded-panel bg-well px-3 py-2.5">
          <Text className="font-mono-medium min-w-0 flex-1 text-label leading-[16px] text-alert">
            {row.isActive
              ? 'This is your active signing wallet. Remove it from the bundle?'
              : 'Remove this wallet from the bundle?'}
          </Text>
          <InlineActionButton
            label="Cancel"
            disabled={isRemoving}
            onPress={() => setMode('view')}
          />
          <InlineActionButton
            label={isRemoving ? 'Removing…' : 'Remove'}
            tone="alert"
            disabled={isRemoving}
            onPress={() => onDelete(row.id)}
          />
        </View>
      ) : null}

      {inlineError ? (
        <Text className="font-mono-medium mt-1.5 text-label leading-[16px] text-alert">
          {inlineError}
        </Text>
      ) : null}
    </View>
  );
}
