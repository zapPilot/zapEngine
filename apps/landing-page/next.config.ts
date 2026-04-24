import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { config as loadDotenv } from 'dotenv';
import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_ENV = path.resolve(configDir, '../../.env');
loadDotenv({ path: REPO_ROOT_ENV });

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
