import { Redirect } from 'expo-router';
import { APP_ROUTES } from '@/integration/navigationModel';
export function FirstRunScreen() {
  return <Redirect href={APP_ROUTES.listen} />;
}
