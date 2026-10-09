import { Link } from 'expo-router';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { Tap } from '@/components/ui/Tap';
import { usePodcastEpisodes } from '@/integration/podcastFeed';
import { podcastEpisodeHref } from '@/integration/podcastRoutes';
import { APP_ROUTES } from '@/integration/navigationModel';
import { useContentLanguage } from '@/providers/ContentLanguageProvider';
export function TodaysBriefCard() {
  const episodes = usePodcastEpisodes();
  const { t } = useContentLanguage();
  const latest = episodes.data?.[0];
  return (
    <Card padding="md" className="gap-3">
      <Text variant="label" tone="muted">
        {t('today.brief')}
      </Text>
      {latest ? <Text variant="heading">{latest.title}</Text> : null}
      <Link
        href={
          latest
            ? podcastEpisodeHref(latest.id, latest.languageCode)
            : APP_ROUTES.listen
        }
        asChild
      >
        <Tap
          accessibilityRole="link"
          accessibilityLabel={t('today.openListen')}
          className="py-2"
        >
          <Text variant="action" tone="sign">
            {t('today.openListen')}
          </Text>
        </Tap>
      </Link>
    </Card>
  );
}
