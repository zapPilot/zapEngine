import type { ReactNode } from 'react';
import { Sheet } from '@/components/ui/Sheet';
import { useFundFlow } from '@/providers/FundFlowProvider';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function FundSheet({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  const fund = useFundFlow();
  const { t } = useContentLanguage();
  return (
    <Sheet
      visible={fund.visible}
      onClose={fund.close}
      title={t('fund.title')}
      eyebrow={t(`fund.step.${fund.step}`)}
      closeLabel={t('common.close')}
      footer={footer}
    >
      {children}
    </Sheet>
  );
}
