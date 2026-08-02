import type { ReactElement, ReactNode } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  type ContentLanguageCode,
  DEFAULT_CONTENT_LANGUAGE_CODE,
} from '@/config/contentLanguages';
import {
  TRANSLATIONS,
  type TranslationKey,
  type TranslationParams,
} from '@/i18n/translations';
import { loadLocale, saveLocale } from '@/storage/localeStorage';

interface ContentLanguageContextValue {
  languageCode: ContentLanguageCode;
  locale: ContentLanguageCode;
  isHydrated: boolean;
  setLanguageCode: (code: ContentLanguageCode) => void;
  setLocale: (code: ContentLanguageCode) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
}

function detectDeviceLocale(): ContentLanguageCode {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale.toLowerCase();
    if (locale.startsWith('ja')) return 'ja';
    if (
      locale.startsWith('zh-tw') ||
      locale.startsWith('zh-hk') ||
      locale.startsWith('zh-mo') ||
      locale.includes('hant')
    ) {
      return 'zh-Hant';
    }
    if (locale.startsWith('en')) return 'en';
  } catch {
    // Use the product default when the runtime does not expose a locale.
  }
  return DEFAULT_CONTENT_LANGUAGE_CODE;
}

function interpolate(template: string, params?: TranslationParams): string {
  if (params === undefined) return template;
  return template.replace(/\{([^}]+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined ? match : String(value);
  });
}

const ContentLanguageContext =
  createContext<ContentLanguageContextValue | null>(null);

/**
 * One global locale for both app chrome and localized podcast content. The
 * legacy hook name remains exported so existing podcast data consumers keep a
 * single source of truth while the UI migrates to translations.
 */
export function ContentLanguageProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [languageCode, setLanguageCodeState] =
    useState<ContentLanguageCode>(detectDeviceLocale);
  const [isHydrated, setIsHydrated] = useState(false);
  const changedWhileHydratingRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadLocale().then((stored) => {
      if (!active) return;
      if (stored !== null && !changedWhileHydratingRef.current) {
        setLanguageCodeState(stored);
      }
      setIsHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  const setLanguageCode = useCallback((code: ContentLanguageCode) => {
    changedWhileHydratingRef.current = true;
    setLanguageCodeState(code);
    void saveLocale(code);
  }, []);

  const t = useCallback(
    (key: TranslationKey, params?: TranslationParams) =>
      interpolate(TRANSLATIONS[languageCode][key], params),
    [languageCode],
  );

  const value = useMemo(
    () => ({
      languageCode,
      locale: languageCode,
      isHydrated,
      setLanguageCode,
      setLocale: setLanguageCode,
      t,
    }),
    [isHydrated, languageCode, setLanguageCode, t],
  );

  return (
    <ContentLanguageContext.Provider value={value}>
      {children}
    </ContentLanguageContext.Provider>
  );
}

export function useContentLanguage(): ContentLanguageContextValue {
  const value = useContext(ContentLanguageContext);
  if (value === null) {
    throw new Error(
      'useContentLanguage must be used within ContentLanguageProvider',
    );
  }
  return value;
}
