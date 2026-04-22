import type { ImgHTMLAttributes, ReactElement } from 'react';

export interface AppImageProps extends Omit<
  ImgHTMLAttributes<HTMLImageElement>,
  'alt' | 'src'
> {
  alt: string;
  src: string;
}

/**
 * Lightweight image wrapper used in place of framework-specific image components.
 *
 * @param props - Standard image props with required `src` and `alt`.
 * @returns A plain image element with sensible defaults.
 *
 * @example
 * ```tsx
 * <AppImage src="/logo.png" alt="Logo" width={32} height={32} />
 * ```
 */
export function AppImage({
  alt,
  decoding = 'async',
  loading = 'lazy',
  src,
  ...props
}: AppImageProps): ReactElement {
  return (
    <img alt={alt} decoding={decoding} loading={loading} src={src} {...props} />
  );
}
