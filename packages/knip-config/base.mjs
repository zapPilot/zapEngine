export const baseConfig = {
  ignoreDependencies: ['@zapengine/eslint-config', '@zapengine/knip-config'],
  ignoreExportsUsedInFile: true,
  eslint: {
    config: ['eslint.config.mjs'],
  },
};

export function defineKnipConfig(config) {
  return {
    ...baseConfig,
    ...config,
    ignoreDependencies: [
      ...new Set([
        ...(baseConfig.ignoreDependencies ?? []),
        ...(config.ignoreDependencies ?? []),
      ]),
    ],
    eslint: config.eslint ?? baseConfig.eslint,
  };
}
