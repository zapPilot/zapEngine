export type SupportedImageContentType =
  | 'image/avif'
  | 'image/jpeg'
  | 'image/png'
  | 'image/webp';

export function contentTypeExtension(
  contentType: SupportedImageContentType,
): string {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  return 'avif';
}
