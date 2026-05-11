class ShareConfig {
  const ShareConfig._();

  static const baseUrl = String.fromEnvironment(
    'SHARE_BASE_URL',
    defaultValue: 'https://from-fed-to-chain-api.fly.dev',
  );

  static Uri episodeUri(String episodeId) {
    final baseUri = Uri.parse(baseUrl);
    return baseUri.replace(pathSegments: ['e', episodeId]);
  }
}
