const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

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

// Must wrap last: withNativeWind composes with (not replaces) the resolver
// assigned above — react-native-css-interop calls the original resolveRequest.
module.exports = withNativeWind(config, { input: './global.css' });
