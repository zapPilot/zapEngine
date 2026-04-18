/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ACCOUNT_API_URL: string;
  readonly VITE_ANALYTICS_ENGINE_URL: string;
  readonly VITE_ENABLE_RQ_DEVTOOLS: string;
  readonly VITE_ENABLE_LOG_VIEWER: string;
  readonly VITE_ENABLE_DEBUG_LOGGING: string;
  readonly VITE_ENABLE_DEV_LOGGING: string;
  readonly VITE_CACHE_MAX_AGE_SECONDS?: string;
  readonly VITE_CACHE_STALE_WHILE_REVALIDATE_SECONDS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
