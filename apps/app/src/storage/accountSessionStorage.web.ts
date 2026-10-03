import type { AccountSessionStorage } from '@/integration/accountSessionStore';

const storage: AccountSessionStorage = {
  async load(key) {
    return typeof localStorage === 'undefined'
      ? null
      : localStorage.getItem(key);
  },
  async save(key, value) {
    localStorage.setItem(key, value);
  },
  async remove(key) {
    localStorage.removeItem(key);
  },
};
export default storage;
