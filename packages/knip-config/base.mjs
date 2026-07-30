export const baseConfig = {
  ignoreDependencies: ['@zapengine/eslint-config', '@zapengine/knip-config'],
  ignoreExportsUsedInFile: true,
  eslint: {
    config: ['eslint.config.mjs'],
  },
};

export function defineKnipConfig(config, options = {}) {
  const omittedDefaultDependencies = new Set(
    options.omitDefaultIgnoreDependencies ?? [],
  );

  return {
    ...baseConfig,
    ...config,
    ignoreDependencies: [
      ...new Set([
        ...(baseConfig.ignoreDependencies ?? []).filter(
          (dependency) => !omittedDefaultDependencies.has(dependency),
        ),
        ...(config.ignoreDependencies ?? []),
      ]),
    ],
    eslint: config.eslint ?? baseConfig.eslint,
  };
}
