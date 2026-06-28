/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCOUNT_API_URL: string;
  readonly VITE_ANALYTICS_ENGINE_URL: string;
  readonly VITE_PRIVY_APP_ID: string;
  readonly VITE_MORALIS_API_KEY?: string;
  readonly VITE_APP_RUNTIME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
