import {
  createContext,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

import {
  CONTENT_LANGUAGE_STORAGE_KEY,
  type ContentLanguageCode,
  DEFAULT_CONTENT_LANGUAGE_CODE,
  isContentLanguageCode,
} from '@/config/contentLanguages';

interface ContentLanguageContextValue {
  languageCode: ContentLanguageCode;
  setLanguageCode: (code: ContentLanguageCode) => void;
}

function readStoredLanguageCode(): ContentLanguageCode {
  try {
    const stored = globalThis.localStorage?.getItem(
      CONTENT_LANGUAGE_STORAGE_KEY,
    );
    if (stored != null && isContentLanguageCode(stored)) {
      return stored;
    }
  } catch {
    // Web storage is unavailable (native runtime); fall back to the default.
  }
  return DEFAULT_CONTENT_LANGUAGE_CODE;
}

function persistLanguageCode(code: ContentLanguageCode): void {
  try {
    globalThis.localStorage?.setItem(CONTENT_LANGUAGE_STORAGE_KEY, code);
  } catch {
    // Best effort: the in-memory value still applies for this session.
  }
}

const ContentLanguageContext = createContext<ContentLanguageContextValue>({
  languageCode: DEFAULT_CONTENT_LANGUAGE_CODE,
  setLanguageCode: () => undefined,
});

/** Persists the podcast/content language preference across app launches. */
export function ContentLanguageProvider({
  children,
}: {
  children: ReactNode;
}): ReactElement {
  const [languageCode, setLanguageCodeState] = useState<ContentLanguageCode>(
    readStoredLanguageCode,
  );

  const setLanguageCode = useCallback((code: ContentLanguageCode) => {
    setLanguageCodeState(code);
    persistLanguageCode(code);
  }, []);

  const value = useMemo(
    () => ({ languageCode, setLanguageCode }),
    [languageCode, setLanguageCode],
  );

  return (
    <ContentLanguageContext.Provider value={value}>
      {children}
    </ContentLanguageContext.Provider>
  );
}

export function useContentLanguage(): ContentLanguageContextValue {
  return useContext(ContentLanguageContext);
}
