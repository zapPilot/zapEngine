import type { ReactElement } from 'react';

import { formatDownloadSize } from '@/components/podcast/episodeFormatters';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';

/** Asks before deleting saved video, which costs a long re-download. */
export function RemoveDownloadSheet({
  visible,
  byteSize,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  byteSize: number;
  onClose: () => void;
  onConfirm: () => void;
}): ReactElement {
  const { t } = useContentLanguage();

  return (
    <ConfirmSheet
      visible={visible}
      onClose={onClose}
      title={t('podcast.downloadRemoveTitle')}
      closeLabel={t('common.close')}
      body={t('podcast.downloadRemoveMessage', {
        size: formatDownloadSize(byteSize),
      })}
      confirmLabel={t('podcast.downloadRemoveConfirm')}
      cancelLabel={t('common.cancel')}
      onConfirm={onConfirm}
      destructive
    />
  );
}
