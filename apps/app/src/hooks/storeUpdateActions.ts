import { openURL } from 'expo-linking';
export function storeUpdateActions(url: string | undefined, retry: () => void) {
  return {
    update: () => {
      if (url) void openURL(url);
    },
    install: () => {},
    retry,
  };
}
