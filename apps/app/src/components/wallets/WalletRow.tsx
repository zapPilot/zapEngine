import { Copy, Pencil, Trash2 } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';

import { Pill } from '@/components/ui/Pill';
import { Tap } from '@/components/ui/Tap';
import type { WalletRowVM } from '@/integration/walletManagerModel';
import { truncateAddress } from '@/lib/format';

interface WalletRowProps {
  row: WalletRowVM;
  divider: boolean;
  isRemoving: boolean;
  removeError: string | null;
  editError: string | null;
  onCopy: (address: string) => void;
  onSaveLabel: (walletId: string, newLabel: string) => void;
  onDelete: (walletId: string) => void;
}

type RowMode = 'view' | 'edit' | 'confirm-remove';

function IconAction({
  label,
  onPress,
  disabled,
  children,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
      className="h-8 w-8 items-center justify-center rounded-full border border-line bg-[rgba(255,255,255,.04)]"
      disabled={disabled}
      onPress={onPress}
    >
      {children}
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
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={label}
      className="rounded-full border px-3 py-1.5"
      style={{
        borderColor:
          tone === 'danger' ? 'rgba(239,116,116,.32)' : 'rgba(212,197,163,.22)',
        backgroundColor:
          tone === 'danger' ? 'rgba(239,116,116,.08)' : 'rgba(212,197,163,.07)',
        opacity: disabled ? 0.5 : 1,
      }}
      disabled={disabled}
      onPress={onPress}
    >
      <Text
        className="font-sans-semibold text-[11px]"
        style={{ color: tone === 'danger' ? '#ef9292' : '#d4c5a3' }}
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
  onCopy,
  onSaveLabel,
  onDelete,
}: WalletRowProps) {
  const [mode, setMode] = useState<RowMode>('view');
  const [labelDraft, setLabelDraft] = useState(row.label);

  const inlineError = removeError ?? editError;

  return (
    <View
      className="px-1 py-3"
      style={
        divider
          ? { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,.05)' }
          : null
      }
    >
      <View className="flex-row items-center gap-3">
        <View className="min-w-0 flex-1">
          <View className="flex-row items-center gap-2">
            {mode === 'edit' ? (
              <TextInput
                className="min-w-0 flex-1 rounded-xl border border-line bg-[rgba(255,255,255,.035)] px-3 py-2 font-sans-semibold text-[13px] text-ink"
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
                  className="font-sans-semibold text-[14px] text-ink"
                  numberOfLines={1}
                >
                  {row.label}
                </Text>
                {row.isActive ? (
                  <Pill className="bg-[rgba(122,216,143,.12)]">
                    <Text className="font-mono text-[9.5px] uppercase tracking-[0.5px] text-success">
                      Active
                    </Text>
                  </Pill>
                ) : null}
              </>
            )}
          </View>
          <Text className="mt-1 font-mono text-[12px] text-accent">
            {truncateAddress(row.address)}
          </Text>
        </View>

        {mode === 'view' ? (
          <View className="flex-row items-center gap-1.5">
            <IconAction
              label={`Copy ${row.label} address`}
              onPress={() => onCopy(row.address)}
            >
              <Copy size={13} strokeWidth={1.8} color="#a1a1aa" />
            </IconAction>
            <IconAction
              label={`Edit ${row.label} label`}
              onPress={() => {
                setLabelDraft(row.label);
                setMode('edit');
              }}
            >
              <Pencil size={13} strokeWidth={1.8} color="#a1a1aa" />
            </IconAction>
            <IconAction
              label={`Remove ${row.label} from bundle`}
              onPress={() => setMode('confirm-remove')}
            >
              <Trash2 size={13} strokeWidth={1.8} color="#ef9292" />
            </IconAction>
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
        <View className="mt-2 flex-row items-center gap-2 rounded-xl bg-[rgba(239,146,146,.07)] px-3 py-2.5">
          <Text className="min-w-0 flex-1 text-[11px] leading-[16px] text-[#ef9292]">
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
            tone="danger"
            disabled={isRemoving}
            onPress={() => onDelete(row.id)}
          />
        </View>
      ) : null}

      {inlineError ? (
        <Text className="mt-1.5 text-[11px] leading-[16px] text-[#ef9292]">
          {inlineError}
        </Text>
      ) : null}
    </View>
  );
}
