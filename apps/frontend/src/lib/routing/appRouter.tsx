import { useCallback, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";

export interface AppRouterNavigateOptions {
  scroll?: boolean;
}

export interface AppRouterLike {
  push: (href: string, options?: AppRouterNavigateOptions) => void;
  replace: (href: string, options?: AppRouterNavigateOptions) => void;
}

function maybeScrollToTop(scroll: boolean | undefined): void {
  if (scroll === false || typeof window === "undefined") {
    return;
  }

  window.scrollTo({ top: 0, left: 0, behavior: "auto" });
}

/**
 * Provide the app-level navigation interface used across the SPA shell.
 *
 * @returns A minimal router with `push` and `replace`.
 *
 * @example
 * ```tsx
 * const router = useAppRouter();
 * router.replace("/bundle?userId=123", { scroll: false });
 * ```
 */
export function useAppRouter(): AppRouterLike {
  const navigate = useNavigate();

  const push = useCallback(
    (href: string, options?: AppRouterNavigateOptions): void => {
      void navigate(href);
      maybeScrollToTop(options?.scroll);
    },
    [navigate]
  );

  const replace = useCallback(
    (href: string, options?: AppRouterNavigateOptions): void => {
      void navigate(href, { replace: true });
      maybeScrollToTop(options?.scroll);
    },
    [navigate]
  );

  return useMemo(
    () => ({
      push,
      replace,
    }),
    [push, replace]
  );
}

/**
 * Read the current pathname from the SPA router.
 *
 * @returns The active pathname.
 *
 * @example
 * ```tsx
 * const pathname = useAppPathname();
 * ```
 */
export function useAppPathname(): string {
  return useLocation().pathname;
}

/**
 * Read the current URL search params from the SPA router.
 *
 * @returns A fresh `URLSearchParams` snapshot for the current location.
 *
 * @example
 * ```tsx
 * const searchParams = useAppSearchParams();
 * const userId = searchParams.get("userId");
 * ```
 */
export function useAppSearchParams(): URLSearchParams {
  const location = useLocation();

  return useMemo(() => new URLSearchParams(location.search), [location.search]);
}
