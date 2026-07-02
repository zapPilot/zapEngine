const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

function resolveRequestWithPackageExports(context, moduleName, platform) {
  if (moduleName === 'isows') {
    const nextContext = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return nextContext.resolveRequest(nextContext, moduleName, platform);
  }

  if (moduleName.startsWith('zustand')) {
    const nextContext = {
      ...context,
      unstable_enablePackageExports: false,
    };
    return nextContext.resolveRequest(nextContext, moduleName, platform);
  }

  if (moduleName === 'jose') {
    const nextContext = {
      ...context,
      unstable_conditionNames: ['browser'],
    };
    return nextContext.resolveRequest(nextContext, moduleName, platform);
  }

  return context.resolveRequest(context, moduleName, platform);
}

config.resolver.resolveRequest = resolveRequestWithPackageExports;

module.exports = config;
