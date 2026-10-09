import storage from './appKeyValueStorage';
import { createSerializedWriter } from './keyValueStorage';
const KEY = 'zap_pilot_first_run_seen';
const writer = createSerializedWriter(storage);
export async function loadFirstRunSeen(): Promise<boolean> {
  try {
    return (await storage.getItem(KEY)) === 'seen';
  } catch {
    return false;
  }
}
export function markFirstRunSeen(): Promise<void> {
  return writer.write(KEY, 'seen');
}
