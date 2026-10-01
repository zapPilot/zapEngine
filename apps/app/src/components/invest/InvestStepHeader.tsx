import { useRouter } from 'expo-router';
import { PageHeader } from '@/components/ui/PageHeader';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function InvestStepHeader({
  title,
  step,
}: {
  title: string;
  step: string;
}) {
  const router = useRouter();
  const { t } = useContentLanguage();
  return (
    <PageHeader
      mode="wizard"
      title={title}
      step={step}
      onBack={() => router.back()}
      backLabel={t('common.back')}
      onClose={() => router.dismissTo('/home')}
      closeLabel={t('common.close')}
    />
  );
}
