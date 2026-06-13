import 'language_codes.dart';

class AppConfig {
  const AppConfig._();

  static const contentLanguageCode = String.fromEnvironment(
    'CONTENT_LANGUAGE_CODE',
    defaultValue: kDefaultLanguageCode,
  );

  static String get defaultLanguageCode => contentLanguageCode;

  static const podcastApiUrl = String.fromEnvironment(
    'PODCAST_API_URL',
    defaultValue: 'https://from-fed-to-chain-api.fly.dev',
  );
}
