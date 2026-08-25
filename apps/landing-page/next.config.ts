import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';

import { loadEnvFile, mergeEnv, projectEnv } from '../../scripts/env/lib.mjs';

const configDir = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT_ENV = path.resolve(configDir, '../../.env');
const canonicalEnv = mergeEnv(loadEnvFile(REPO_ROOT_ENV).values, process.env);
Object.assign(
  process.env,
  canonicalEnv,
  projectEnv(canonicalEnv, 'landing-page'),
);

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
