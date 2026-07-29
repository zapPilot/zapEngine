const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

const assertIosNativeDependencies = require('./scripts/assert-ios-native-dependencies.cjs');
const assertWorkspaceDistFresh = require('./scripts/assert-workspace-dist-fresh.cjs');

// Every Metro entry point loads this file — dev server, `expo export`, and the
// `expo export:embed` invoked by Xcode's bundle phase. Fail here so a stale
// packages/*/dist reports itself instead of surfacing as a resolution error.
// Release Xcode builds also fail before emitting a JS/native-mismatched app.
assertIosNativeDependencies(__dirname);
assertWorkspaceDistFresh(__dirname);

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
