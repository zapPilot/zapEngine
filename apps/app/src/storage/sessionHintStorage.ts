import storage from './appKeyValueStorage';
import { createSerializedWriter } from './keyValueStorage';
const key = 'zap_pilot_session_hint';
const writer = createSerializedWriter(storage);
export async function loadSessionHint(): Promise<boolean> {
  try {
    return (await storage.getItem(key)) === 'signed_in';
  } catch {
    return false;
  }
}
export function saveSessionHint(signedIn: boolean): Promise<void> {
  return writer.write(key, signedIn ? 'signed_in' : 'signed_out');
}
