import React from 'react';

type NextImageMockProps = {
  alt?: string;
  priority?: unknown;
  placeholder?: unknown;
  blurDataURL?: unknown;
  loading?: unknown;
  unoptimized?: unknown;
  [key: string]: unknown;
};

export const nextImageMock = {
  __esModule: true,
  default: ({ alt, ...props }: NextImageMockProps) => {
    const {
      priority: _priority,
      placeholder: _placeholder,
      blurDataURL: _blurDataURL,
      loading: _loading,
      unoptimized: _unoptimized,
      ...htmlProps
    } = props;
    return React.createElement('img', { alt: alt ?? '', ...htmlProps });
  },
};
