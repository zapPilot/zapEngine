import { Check, ChevronDown } from 'lucide-react-native';
import { useRef, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';

import { Tap } from '@/components/ui/Tap';
import { CONTENT_LANGUAGE_OPTIONS } from '@/config/contentLanguages';
import type { ContentLanguageCode } from '@/config/contentLanguages';
import { cn } from '@/lib/cn';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

interface ContentLanguageOptionRowsProps {
  onSelect?: () => void;
}

export function getContentLanguageBadge(languageCode: string): string {
  return (
    CONTENT_LANGUAGE_OPTIONS.find((option) => option.code === languageCode)
      ?.badge ?? languageCode.slice(0, 2).toUpperCase()
  );
}

export function ContentLanguageOptionRows({
  onSelect,
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
        return (
          <Tap
            key={option.code}
            accessibilityRole="button"
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
            {selected ? (
              <Check size={16} strokeWidth={2} color="#d4c5a3" />
            ) : null}
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

export function PodcastLanguageDropdown() {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DropdownAnchor>(FALLBACK_ANCHOR);
  const triggerRef = useRef<View>(null);
  const { languageCode } = useContentLanguage();

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
        accessibilityState={{ expanded: open }}
        onPress={() => (open ? setOpen(false) : openMenu())}
        className={cn(
          'h-12 w-12 items-center justify-center rounded-full border',
          open
            ? 'border-[rgba(212,197,163,.42)] bg-[rgba(212,197,163,.16)]'
            : 'border-[rgba(212,197,163,.24)] bg-[rgba(255,255,255,.045)]',
        )}
      >
        <View className="items-center">
          <Text className="font-mono text-[12px] font-bold text-accent">
            {getContentLanguageBadge(languageCode)}
          </Text>
          <ChevronDown size={10} strokeWidth={2} color="#d4c5a3" />
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
          <ContentLanguageOptionRows onSelect={() => setOpen(false)} />
        </View>
      </Modal>
    </View>
  );
}
