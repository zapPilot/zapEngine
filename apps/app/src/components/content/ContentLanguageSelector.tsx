import { Check, ChevronDown } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import {
  CONTENT_LANGUAGE_OPTIONS,
  type ContentLanguageCode,
} from '@/config/contentLanguages';
import type { PodcastCompletionSummary } from '@/integration/podcastProgress';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

export type PodcastCompletionByLanguage = Readonly<
  Partial<Record<ContentLanguageCode, PodcastCompletionSummary>>
>;

interface ContentLanguageOptionRowsProps {
  onSelect?: () => void;
  completionByLanguage?: PodcastCompletionByLanguage | undefined;
}

export function getContentLanguageBadge(languageCode: string): string {
  return (
    CONTENT_LANGUAGE_OPTIONS.find((option) => option.code === languageCode)
      ?.badge ?? languageCode.slice(0, 2).toUpperCase()
  );
}

export function ContentLanguageOptionRows({
  onSelect,
  completionByLanguage,
}: ContentLanguageOptionRowsProps) {
  const { languageCode, setLanguageCode } = useContentLanguage();

  const selectLanguage = (code: ContentLanguageCode) => {
    setLanguageCode(code);
    onSelect?.();
  };

  return (
    <View>
      {CONTENT_LANGUAGE_OPTIONS.map((option, index) => {
        const selected = option.code === languageCode;
        const completion = completionByLanguage?.[option.code];
        const completionText =
          completion === undefined
            ? null
            : completion.total === 0
              ? '尚無節目'
              : `${completion.percentage}%`;
        const accessibilityLabel =
          completion === undefined
            ? option.nativeName
            : completion.total === 0
              ? `${option.nativeName}，尚無節目`
              : `${option.nativeName}，已聽完 ${completion.completed} / ${completion.total} 集，${completion.percentage}%`;
        return (
          <Tap
            key={option.code}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{ selected }}
            onPress={() => selectLanguage(option.code)}
            className={cn(
              'flex-row items-center justify-between py-[11px]',
              index < CONTENT_LANGUAGE_OPTIONS.length - 1 &&
                'border-b border-line',
            )}
          >
            <View className="flex-row items-center">
              <View
                className={cn(
                  'h-8 w-8 items-center justify-center rounded-lg border',
                  selected
                    ? 'border-[rgba(212,197,163,.3)] bg-[rgba(212,197,163,.12)]'
                    : 'border-line bg-[rgba(255,255,255,.045)]',
                )}
              >
                <Text
                  className={cn(
                    'font-mono text-[11px]',
                    selected ? 'text-accent' : 'text-ink',
                  )}
                >
                  {option.badge}
                </Text>
              </View>
              <Text className="ml-3 text-[13px] text-ink">
                {option.nativeName}
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              {completionText !== null ? (
                <Text className="font-mono text-[10px] text-ink-dim">
                  {completionText}
                </Text>
              ) : null}
              {selected ? (
                <Check size={16} strokeWidth={2} color="#d4c5a3" />
              ) : null}
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

interface DropdownAnchor {
  top: number;
  left: number;
}

const FALLBACK_ANCHOR: DropdownAnchor = { top: 96, left: 20 };

export function PodcastLanguageDropdown({
  completionByLanguage,
}: {
  completionByLanguage?: PodcastCompletionByLanguage | undefined;
} = {}) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DropdownAnchor>(FALLBACK_ANCHOR);
  const triggerRef = useRef<View>(null);
  const { languageCode } = useContentLanguage();
  const selectedOption = CONTENT_LANGUAGE_OPTIONS.find(
    (option) => option.code === languageCode,
  );
  const selectedCompletion = completionByLanguage?.[languageCode];
  const showsCompletion = completionByLanguage !== undefined;
  const triggerCompletionText =
    selectedCompletion === undefined || selectedCompletion.total === 0
      ? '—'
      : `${selectedCompletion.percentage}%`;
  const completionHint =
    selectedCompletion === undefined
      ? undefined
      : selectedCompletion.total === 0
        ? `${selectedOption?.nativeName ?? languageCode}，尚無節目`
        : `${selectedOption?.nativeName ?? languageCode}，已聽完 ${selectedCompletion.completed} / ${selectedCompletion.total} 集，${selectedCompletion.percentage}%`;

  const openMenu = () => {
    const node = triggerRef.current;
    if (node === null) {
      setAnchor(FALLBACK_ANCHOR);
      setOpen(true);
      return;
    }
    node.measureInWindow((x, y, _width, height) => {
      setAnchor({ top: y + height + 6, left: x });
      setOpen(true);
    });
  };

  return (
    <View ref={triggerRef} collapsable={false}>
      <Tap
        accessibilityRole="button"
        accessibilityLabel="Choose podcast language"
        accessibilityHint={completionHint}
        accessibilityState={{ expanded: open }}
        onPress={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          'items-center justify-center rounded-full border',
          showsCompletion ? 'h-11 min-w-[76px] px-3' : 'h-12 w-12',
          open
            ? 'border-[rgba(212,197,163,.42)] bg-[rgba(212,197,163,.16)]'
            : 'border-[rgba(212,197,163,.24)] bg-[rgba(255,255,255,.045)]',
        )}
      >
        <View
          className={cn(
            showsCompletion
              ? 'flex-row items-center gap-[5px]'
              : 'items-center',
          )}
        >
          <Text className="font-mono text-[12px] font-bold text-accent">
            {getContentLanguageBadge(languageCode)}
          </Text>
          {showsCompletion ? (
            <>
              <Text className="font-mono text-[10px] text-ink-faint">·</Text>
              <Text className="font-mono text-[11px] text-ink-dim">
                {triggerCompletionText}
              </Text>
            </>
          ) : null}
          <ChevronDown
            size={showsCompletion ? 11 : 10}
            strokeWidth={2}
            color="#d4c5a3"
          />
        </View>
      </Tap>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityLabel="Close language menu"
          onPress={() => setOpen(false)}
          className="flex-1"
        />
        <View
          className="absolute w-[232px] rounded-[22px] border border-line bg-surface px-4 py-2 shadow-lg"
          style={{ top: anchor.top, left: anchor.left }}
        >
          <ContentLanguageOptionRows
            completionByLanguage={completionByLanguage}
            onSelect={() => setOpen(false)}
          />
        </View>
      </Modal>
    </View>
  );
}
