import { Icon } from '@/components/ui/Icon';
import { Check, ChevronDown } from 'lucide-react-native';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { ActionSheet } from '@/components/ui/ActionSheet';

import { Tap } from '@/components/ui/Tap';
import {
  CONTENT_LANGUAGE_OPTIONS,
  contentLanguageBadge,
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
  onLanguageSelected?: ((code: ContentLanguageCode) => void) | undefined;
  completionByLanguage?: PodcastCompletionByLanguage | undefined;
}

export function ContentLanguageOptionRows({
  onSelect,
  onLanguageSelected,
  completionByLanguage,
}: ContentLanguageOptionRowsProps) {
  const { languageCode, setLanguageCode, t } = useContentLanguage();

  const selectLanguage = (code: ContentLanguageCode) => {
    setLanguageCode(code);
    onLanguageSelected?.(code);
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
              ? t('language.noEpisodes')
              : `${completion.percentage}%`;
        const accessibilityLabel =
          completion === undefined
            ? option.nativeName
            : completion.total === 0
              ? `${option.nativeName}, ${t('language.noEpisodes')}`
              : t('language.progress', {
                  name: option.nativeName,
                  completed: completion.completed,
                  total: completion.total,
                  percentage: completion.percentage,
                });
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
                'border-b border-rule',
            )}
          >
            <View className="flex-row items-center">
              <View
                className={cn(
                  'h-8 w-8 items-center justify-center rounded-panel border',
                  selected ? 'border-rule-2 bg-well' : 'border-rule bg-well',
                )}
              >
                <Text
                  className={cn(
                    'font-mono text-data',
                    selected ? 'text-ink' : 'text-ink',
                  )}
                >
                  {option.badge}
                </Text>
              </View>
              <Text className="font-text ml-3 text-body-sm text-ink">
                {option.nativeName}
              </Text>
            </View>
            <View className="flex-row items-center gap-3">
              {completionText !== null ? (
                <Text className="font-mono text-data text-ink-2">
                  {completionText}
                </Text>
              ) : null}
              {selected ? <Icon icon={Check} size="sm" tone="sign" /> : null}
            </View>
          </Tap>
        );
      })}
    </View>
  );
}

export function PodcastLanguageDropdown({
  completionByLanguage,
  onLanguageSelected,
}: {
  completionByLanguage?: PodcastCompletionByLanguage | undefined;
  onLanguageSelected?: ((code: ContentLanguageCode) => void) | undefined;
} = {}) {
  const [open, setOpen] = useState(false);
  const { languageCode, t } = useContentLanguage();
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
        ? `${selectedOption?.nativeName ?? languageCode}, ${t('language.noEpisodes')}`
        : t('language.progress', {
            name: selectedOption?.nativeName ?? languageCode,
            completed: selectedCompletion.completed,
            total: selectedCompletion.total,
            percentage: selectedCompletion.percentage,
          });

  return (
    <View>
      <Tap
        accessibilityRole="button"
        accessibilityLabel={t('language.choose')}
        accessibilityHint={completionHint}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        className={cn(
          'items-center justify-center rounded-round border',
          showsCompletion ? 'h-11 min-w-[76px] px-3' : 'h-11 w-11',
          open ? 'border-rule-2 bg-well' : 'border-rule-2 bg-well',
        )}
      >
        <View
          className={cn(
            showsCompletion
              ? 'flex-row items-center gap-[5px]'
              : 'items-center',
          )}
        >
          <Text className="font-mono text-data font-text-semibold text-ink">
            {contentLanguageBadge(languageCode)}
          </Text>
          {showsCompletion ? (
            <>
              <Text className="font-mono text-data text-ink-3">·</Text>
              <Text className="font-mono text-data text-ink-2">
                {triggerCompletionText}
              </Text>
            </>
          ) : null}
          <Icon icon={ChevronDown} size="md" tone="sign" />
        </View>
      </Tap>
      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('language.choose')}
        closeLabel={t('language.closeMenu')}
      >
        <ContentLanguageOptionRows
          completionByLanguage={completionByLanguage}
          onSelect={() => setOpen(false)}
          onLanguageSelected={onLanguageSelected}
        />
      </ActionSheet>
    </View>
  );
}
