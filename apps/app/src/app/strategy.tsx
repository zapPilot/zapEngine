import { Redirect } from 'expo-router';
import { APP_ROUTES } from '@/integration/navigationModel';
export default function DecisionRedirect() {
  return <Redirect href={APP_ROUTES.decision} />;
}
