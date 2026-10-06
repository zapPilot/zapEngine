import Constants from 'expo-constants';
export const STORE_LINKS = {
  appStore: Constants.expoConfig?.ios?.appStoreUrl,
  googlePlay: Constants.expoConfig?.android?.playStoreUrl,
};
