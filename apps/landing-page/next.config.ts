import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

const isDev = process.env.NODE_ENV === 'development';

const nextConfig: NextConfig = {
  ...(isDev ? {} : { output: 'export' }),
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
  assetPrefix: '',
  basePath: '',
  reactStrictMode: true,
};

const withMDX = createMDX();

export default withMDX(nextConfig);
