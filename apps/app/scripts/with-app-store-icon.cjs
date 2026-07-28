// CommonJS on purpose: Expo loads config plugins through require(), and this
// package has no "type": "module" (same reason metro.config.js is CJS).
const fs = require('node:fs');
const path = require('node:path');

const { withDangerousMod, withInfoPlist } = require('expo/config-plugins');

const APPICON_SET = 'Images.xcassets/AppIcon.appiconset';
const CONTENTS_JSON = `${APPICON_SET}/Contents.json`;

// Expo emits a single-size appiconset — one `{ idiom: "universal", platform:
// "ios" }` entry. actool compiles that to `phone` renditions only, so Assets.car
// carries no `ios-marketing` rendition. Device icons are therefore correct and
// Apple never rejects the build, but App Store Connect reads `ios-marketing` to
// render the app icon, so every surface there shows a blank placeholder.
// Re-declaring the same 1024 file under `ios-marketing` makes actool emit both.
const MARKETING_IDIOM = 'ios-marketing';

function addMarketingIcon(contents) {
  const images = contents.images ?? [];

  if (images.some((image) => image.idiom === MARKETING_IDIOM)) {
    return null;
  }

  const source = images.find((image) => image.filename);

  if (!source) {
    throw new Error(
      `${CONTENTS_JSON} has no image with a filename — cannot derive the App Store icon.`,
    );
  }

  return {
    ...contents,
    images: [
      ...images,
      {
        filename: source.filename,
        idiom: MARKETING_IDIOM,
        scale: '1x',
        size: '1024x1024',
      },
    ],
  };
}

function withMarketingIconAsset(config) {
  return withDangerousMod(config, [
    'ios',
    (modConfig) => {
      const contentsPath = path.join(
        modConfig.modRequest.platformProjectRoot,
        modConfig.modRequest.projectName,
        CONTENTS_JSON,
      );

      // Loud on purpose: a silent skip here reintroduces the blank-icon bug and
      // is only visible three weeks later in App Store Connect.
      if (!fs.existsSync(contentsPath)) {
        throw new Error(
          `Expected Expo to have generated ${contentsPath} before this plugin ran.`,
        );
      }

      const contents = JSON.parse(fs.readFileSync(contentsPath, 'utf8'));
      const patched = addMarketingIcon(contents);

      if (patched) {
        fs.writeFileSync(contentsPath, `${JSON.stringify(patched, null, 2)}\n`);
      }

      return modConfig;
    },
  ]);
}

// actool omits the top-level CFBundleIconName for this appiconset shape, leaving
// only the nested CFBundleIcons dictionary. iOS 11+ App Store builds are meant to
// carry it (ITMS-90713), so declare it rather than depend on actool's inference.
function withBundleIconName(config) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.CFBundleIconName = 'AppIcon';
    return modConfig;
  });
}

module.exports = function withAppStoreIcon(config) {
  return withBundleIconName(withMarketingIconAsset(config));
};
