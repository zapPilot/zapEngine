import { Redirect, useLocalSearchParams } from 'expo-router';
import { APP_ROUTES } from '@/integration/navigationModel';
export default function SharedPortfolioRedirect() {
  const { userId } = useLocalSearchParams<{ userId?: string | string[] }>();
  const id = Array.isArray(userId) ? userId[0] : userId;
  return (
    <Redirect
      href={
        id
          ? `${APP_ROUTES.today}?userId=${encodeURIComponent(id)}`
          : APP_ROUTES.today
      }
    />
  );
}
