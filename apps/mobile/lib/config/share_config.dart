class ShareConfig {
  const ShareConfig._();

  static const baseUrl = String.fromEnvironment(
    'SHARE_BASE_URL',
    defaultValue: 'https://from-fed-to-chain-api.fly.dev',
  );

  static Uri episodeUri(String episodeId, {String? languageCode}) {
    final baseUri = Uri.parse(baseUrl);
    final language = languageCode?.trim();
    final hasLanguage = language != null && language.isNotEmpty;
    return baseUri.replace(
      pathSegments: ['e', episodeId],
      queryParameters: hasLanguage ? {'lang': language} : null,
    );
  }
}
