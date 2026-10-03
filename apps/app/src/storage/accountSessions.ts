import { createAccountSessionStore } from '@/integration/accountSessionStore';
import storage from './accountSessionStorage';

export const accountSessions = createAccountSessionStore(storage);
