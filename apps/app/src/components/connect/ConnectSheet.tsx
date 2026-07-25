import type { WalletConnectorOption } from '@zapengine/app-core/types';
import { QrCode } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Pressable,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONNECT_SHEET_COPY } from '@/components/connect/connectCopy';
import { PrivyLoginOption } from '@/components/connect/PrivyLoginOption';
import { WalletOptionList } from '@/components/connect/WalletOptionList';
import { WalletOptionRow } from '@/components/connect/WalletOptionRow';
import { GlowCircle } from '@/components/ui/GlowCircle';
import { InlineErrorCard } from '@/components/ui/InlineErrorCard';
import { SectionLabel } from '@/components/ui/SectionLabel';

const SHEET_OFFSCREEN_Y = 420;
const BRAND_EASING = Easing.bezier(0.2, 0.65, 0.3, 0.99);

export interface ConnectSheetProps {
  visible: boolean;
  onClose: () => void;
  recommended: WalletConnectorOption[];
  other: WalletConnectorOption[];
  connectingId: string | null;
  errorCopy: { title: string; body: string } | null;
  onPrivyPress: () => void;
  onWalletPress: (option: WalletConnectorOption) => void;
}

/**
 * Custom "choose how to connect" bottom sheet — absolute-positioned overlay
 * (mirrors ToastProvider/ContentLanguageSelector; no sheet library exists in
 * this app). Presentational only: takes discovered wallets and the connect
 * actions via props, so it stays previewable without importing wagmi/Privy.
 */
export function ConnectSheet({
  visible,
  onClose,
  recommended,
  other,
  connectingId,
  errorCopy,
  onPrivyPress,
  onWalletPress,
}: ConnectSheetProps) {
  const insets = useSafeAreaInsets();
  const [reduceMotion, setReduceMotion] = useState(false);
  const [backdropOpacity] = useState(() => new Animated.Value(visible ? 1 : 0));
  const [translateY] = useState(
    () => new Animated.Value(visible ? 0 : SHEET_OFFSCREEN_Y),
  );

  // Keep rendering through the exit animation: `visible` flips to false
  // immediately, but the sheet only unmounts once the close animation's
  // `.start()` callback reports it finished (see the effect below).
  const [isClosing, setIsClosing] = useState(false);
  const [prevVisible, setPrevVisible] = useState(visible);
  if (visible !== prevVisible) {
    setPrevVisible(visible);
    if (!visible) {
      setIsClosing(true);
    }
  }
  const shouldRender = visible || isClosing;

  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (!cancelled) setReduceMotion(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: reduceMotion ? 0 : 260,
          easing: BRAND_EASING,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: reduceMotion ? 0 : SHEET_OFFSCREEN_Y,
          duration: reduceMotion ? 0 : 180,
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setIsClosing(false);
      });
    }
  }, [visible, reduceMotion, backdropOpacity, translateY]);

  if (!shouldRender) {
    return null;
  }

  const isBusy = connectingId !== null;
  const injectedOther = other.filter(
    (option) => option.type !== 'walletConnect',
  );
  const walletConnectOption = other.find(
    (option) => option.type === 'walletConnect',
  );
  const hasAnyInjected = recommended.length > 0 || injectedOther.length > 0;
  const otherRows = [
    ...injectedOther,
    ...(walletConnectOption ? [walletConnectOption] : []),
  ];

  return (
    <View className="absolute inset-0 z-50 items-center justify-end">
      <Animated.View
        style={{ opacity: backdropOpacity }}
        className="absolute inset-0"
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={CONNECT_SHEET_COPY.closeLabel}
          disabled={isBusy}
          onPress={onClose}
          className="absolute inset-0"
          style={{ backgroundColor: 'rgba(0,0,0,.66)' }}
        />
      </Animated.View>

      <Animated.View
        role="dialog"
        accessibilityViewIsModal
        style={{ transform: [{ translateY }], opacity: backdropOpacity }}
        className="w-full max-w-[460px] self-center overflow-hidden rounded-t-[28px] border border-b-0 border-line bg-surface shadow-lg"
      >
        <GlowCircle
          size={240}
          color="#d4c5a3"
          opacity={0.1}
          className="left-1/2 top-[-60px] -ml-[120px]"
        />

        <View
          className="px-5 pt-3"
          style={{ paddingBottom: Math.max(insets.bottom, 24) }}
        >
          <View className="mb-4 h-1 w-9 self-center rounded-full bg-line-hi" />

          <SectionLabel>{CONNECT_SHEET_COPY.eyebrow}</SectionLabel>
          <Text className="mt-1 font-serif text-[26px] leading-[30px] text-ink">
            {CONNECT_SHEET_COPY.title}
          </Text>
          <Text className="mt-2 font-sans text-[12.5px] leading-5 text-ink-dim">
            {CONNECT_SHEET_COPY.subtitle}
          </Text>

          {errorCopy ? (
            <InlineErrorCard
              className="mt-4"
              title={errorCopy.title}
              body={errorCopy.body}
            />
          ) : null}

          <View className="mt-4">
            <PrivyLoginOption
              isConnecting={connectingId === 'privy'}
              disabled={isBusy && connectingId !== 'privy'}
              onPress={onPrivyPress}
            />
          </View>

          <View className="my-4 flex-row items-center gap-3">
            <View className="h-px flex-1 bg-line" />
            <SectionLabel>{CONNECT_SHEET_COPY.divider}</SectionLabel>
            <View className="h-px flex-1 bg-line" />
          </View>

          {hasAnyInjected ? (
            <>
              {recommended.length > 0 ? (
                <View className="mb-2">
                  <SectionLabel>
                    {CONNECT_SHEET_COPY.recommendedLabel}
                  </SectionLabel>
                  <WalletOptionList
                    options={recommended}
                    connectingId={connectingId}
                    isBusy={isBusy}
                    onWalletPress={onWalletPress}
                  />
                </View>
              ) : null}

              {otherRows.length > 0 ? (
                <View>
                  <View className="flex-row items-baseline justify-between">
                    <SectionLabel>{CONNECT_SHEET_COPY.otherLabel}</SectionLabel>
                    <Text className="font-sans text-[10.5px] text-ink-faint">
                      {CONNECT_SHEET_COPY.otherCaption}
                    </Text>
                  </View>
                  <WalletOptionList
                    options={otherRows}
                    connectingId={connectingId}
                    isBusy={isBusy}
                    onWalletPress={onWalletPress}
                  />
                </View>
              ) : null}
            </>
          ) : walletConnectOption ? (
            <WalletOptionRow
              option={walletConnectOption}
              isConnecting={connectingId === walletConnectOption.id}
              disabled={isBusy && connectingId !== walletConnectOption.id}
              showBorder={false}
              onPress={() => onWalletPress(walletConnectOption)}
            />
          ) : (
            <View className="flex-row items-center gap-3 rounded-2xl border border-line bg-[rgba(255,255,255,.03)] px-4 py-4">
              <View className="h-9 w-9 items-center justify-center rounded-xl border border-line bg-[rgba(255,255,255,.04)]">
                <QrCode size={18} strokeWidth={1.75} color="#52525b" />
              </View>
              <View className="flex-1">
                <Text className="font-sans-semibold text-[13px] text-ink">
                  {CONNECT_SHEET_COPY.emptyTitle}
                </Text>
                <Text className="mt-0.5 font-sans text-[11.5px] leading-4 text-ink-dim">
                  {CONNECT_SHEET_COPY.emptyBody}
                </Text>
              </View>
            </View>
          )}

          <View className="mt-4 flex-row items-center gap-2 border-t border-line pt-3">
            <Text className="font-sans text-[11px] text-ink-faint">
              {CONNECT_SHEET_COPY.footer}
            </Text>
          </View>
        </View>
      </Animated.View>
    </View>
  );
}
