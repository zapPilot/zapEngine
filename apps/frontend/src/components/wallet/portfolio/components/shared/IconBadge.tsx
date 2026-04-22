import { useState } from 'react';

interface IconBadgeProps {
  /** Image URL from CDN */
  src: string;
  /** Alt text for accessibility */
  alt: string;
  /** Icon size variant */
  size?: 'sm' | 'md'; // 20px or 24px
  /** Fallback content when image fails */
  fallback: {
    type: 'letter' | 'text';
    content: string;
  };
}

/**
 * Universal icon badge with 3-tier fallback system:
 * 1. CDN image (WebP)
 * 2. Colored letter badge (first letter of symbol/protocol)
 * 3. Text label
 */
export function IconBadge({ src, alt, size = 'md', fallback }: IconBadgeProps) {
  const [imageStatus, setImageStatus] = useState<
    'loading' | 'success' | 'error'
  >('loading');

  const sizeClasses = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';

  return (
    <div className={`relative ${sizeClasses}`}>
      {imageStatus !== 'error' && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          className="rounded-full object-cover w-full h-full"
          onLoad={() => setImageStatus('success')}
          onError={() => setImageStatus('error')}
        />
      )}

      {imageStatus === 'error' && (
        <div
          className={`
          flex items-center justify-center rounded-full
          bg-gradient-to-br from-purple-500 to-blue-500
          text-white font-bold text-xs
          ${sizeClasses}
        `}
        >
          {fallback.type === 'letter'
            ? (fallback.content?.[0] ?? '?').toUpperCase()
            : fallback.content}
        </div>
      )}
    </div>
  );
}
