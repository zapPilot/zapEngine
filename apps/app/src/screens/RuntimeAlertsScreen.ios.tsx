import { Redirect } from 'expo-router';
import { APP_ROUTES } from '@/integration/navigationModel';
export function RuntimeAlertsScreen() {
  return <Redirect href={APP_ROUTES.runtime} />;
}
