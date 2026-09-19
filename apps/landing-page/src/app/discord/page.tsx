import { DiscordRedirect } from '@/components/discord/DiscordRedirect';

export const metadata = {
  title: 'Join the Zap Pilot Discord',
  robots: { index: false, follow: true },
};

export default function DiscordPage() {
  return <DiscordRedirect />;
}
