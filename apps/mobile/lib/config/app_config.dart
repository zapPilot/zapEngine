import 'language_codes.dart';

class AppConfig {
  const AppConfig._();

  static const contentLanguageCode = String.fromEnvironment(
    'CONTENT_LANGUAGE_CODE',
    defaultValue: kDefaultLanguageCode,
  );

  static String get defaultLanguageCode => contentLanguageCode;
}
